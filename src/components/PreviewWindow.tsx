import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type {
  TimelineClip,
  AudioTrack,
  BackgroundTrack,
  GraphicTimelineClip,
} from "@/types/storyboard";
import { useTimelineStore } from "@/store/TimelineStore";
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_WEIGHT_LABEL,
  fontWeightLabelToCss,
  normalizeFontWeightLabel,
} from "@/lib/fontConstants";

/* -------------------------- Types & props -------------------------- */
interface Track {
  id: string;
  name: string;
  clips: any[];
  isBackground?: boolean;
}

interface PreviewWindowProps {
  clips: TimelineClip[];
  audioTracks: AudioTrack[];
  backgroundTracks: BackgroundTrack[];
  graphics: GraphicTimelineClip[];
  tracks: Track[];
  currentTime: number;
  isPlaying: boolean;
  customThumbnails?: Record<string, string>;
  onClipsUpdate?: (clips: TimelineClip[]) => void;
  onGraphicsUpdate?: (graphics: GraphicTimelineClip[]) => void;
}

/* ------------------------------ Utils ------------------------------ */
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pctOrPx = (n?: number, fallbackPct = 0): string =>
  typeof n === "number" ? (n > 1 ? `${n}px` : `${(n || 0) * 100}%`) : `${fallbackPct * 100}%`;

const toUnit = (v: number | undefined, container: number, fallback: number) => {
  if (typeof v !== "number") return fallback;
  const val = v > 1 ? v / Math.max(1, container) : v;
  return clamp01(val);
};

const FALLBACK_FONT_STACK =
  'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';

const sanitizeFontFamilyName = (family: string | undefined | null) =>
  typeof family === "string" ? family.replace(/["']/g, "").trim() : "";

const buildFontStack = (family: string) => {
  const cleaned = sanitizeFontFamilyName(family);
  if (!cleaned) return FALLBACK_FONT_STACK;
  if (cleaned.includes(",")) {
    return `${cleaned}, ${FALLBACK_FONT_STACK}`;
  }
  return `"${cleaned}", ${FALLBACK_FONT_STACK}`;
};

const resolveGraphicFontFamily = (graphic?: GraphicTimelineClip | null) => {
  if (!graphic) return "";
  const direct = sanitizeFontFamilyName(graphic.fontFamily);
  if (direct) return direct;
  const metaValue = sanitizeFontFamilyName((graphic as any)?.meta?.fontFamily);
  return metaValue;
};

const getClipIcon = (type: TimelineClip["type"]) => {
  const icons = { fade: "🌅", slide: "⬅️", zoom: "🔍", rotate: "🔄", bounce: "⚡", elastic: "🎯" } as const;
  return icons[type as keyof typeof icons] ?? "🎬";
};

type Handle = "nw" | "ne" | "sw" | "se";
type Mode =
  | { kind: "idle" }
  | { kind: "drag-clip"; id: string; w: number; h: number; offsetXNorm: number; offsetYNorm: number }
  | { kind: "drag-graphic"; id: string; w: number; h: number; offsetXNorm: number; offsetYNorm: number }
  | { kind: "resize-clip"; id: string; startX: number; startY: number; startW: number; startH: number; handle: Handle }
  | { kind: "resize-graphic"; id: string; startX: number; startY: number; startW: number; startH: number; handle: Handle };

function normalizeWindow(obj: any) {
  const start =
    (typeof obj?.startTime === "number" ? obj.startTime : undefined) ??
    (typeof obj?.start === "number" ? obj.start : 0);

  let end = (typeof obj?.endTime === "number" ? obj.endTime : undefined);
  if (end == null && typeof obj?.duration === "number") end = start + obj.duration;
  return { start, end };
}
function isActiveAt(obj: any, t: number, tol = 0.001) {
  const { start, end } = normalizeWindow(obj);
  if (typeof end === "number") return t >= start && t < end + tol;
  return t >= start;
}

/* ------------------------ Background helpers ----------------------- */
type AnyBackground = {
  id: string;
  kind: "gradient" | "color" | "image";
  gradientColors?: string[];
  gradientDirection?: string;
  color?: string;
  imageUrl?: string;
  fit?: "cover" | "contain" | "repeat" | string;
  raw?: any;
};

function extractBackgrounds(
  backgroundTracks: BackgroundTrack[] | undefined,
  _graphics: GraphicTimelineClip[] | undefined
): AnyBackground[] {
  const out: AnyBackground[] = [];
  (backgroundTracks || []).forEach((raw: any, ti: number) => {
    const items: any[] = Array.isArray(raw?.clips) ? raw.clips : [raw];
    items.forEach((bg, ci) => {
      const stableId = bg.id ?? `${raw.id ?? "bgtrack"}:${ti}:${ci}`;
      const meta = bg.meta ?? raw.meta ?? {};
      const kind = (
        bg.type ??
        bg.backgroundType ??
        bg.kind ??
        meta.kind ??
        meta.type ??
        "color"
      ) as string;
      let imageUrl =
        bg.imageUrl ??
        bg.url ??
        bg.src ??
        (typeof bg.value === "string" && /^(data:image|https?:)/.test(bg.value) ? bg.value : undefined) ??
        bg.image ??
        meta.src ??
        meta.image ??
        meta.url ??
        undefined;
      if (typeof imageUrl === "string" && imageUrl.startsWith("blob:")) {
        imageUrl = undefined;
      }
      const color =
        bg.color ??
        bg.backgroundColor ??
        meta.color ??
        meta.backgroundColor ??
        undefined;
      const gradientColors: string[] | undefined =
        bg.gradientColors ??
        bg.colors ??
        meta.gradientColors ??
        meta.colors ??
        (Array.isArray(meta.stops)
          ? meta.stops.map((stop: any) => stop?.color).filter(Boolean)
          : undefined);
      const gradientDirection: string | undefined =
        bg.gradientDirection ??
        meta.gradientDirection ??
        meta.direction ??
        undefined;
      const fit = bg.imageFit ?? bg.fit ?? meta.imageFit ?? "cover";
      out.push({
        id: stableId,
        kind: (kind === "gradient" || kind === "image" || kind === "color") ? kind : "color",
        gradientColors, gradientDirection, color, imageUrl, fit, raw: bg,
      });
    });
  });
  return out;
}
/*-------------------- Graphic Transition Helpers ----------------*/
const ease = (t: number, fn = "ease") => {
  // super lightweight easing sampler—keep it linear for now;
  // browsers will smooth the CSS; this just clamps [0..1].
  return Math.max(0, Math.min(1, t));
};

function progressInWindow(t: number, start: number, dur: number) {
  if (dur <= 0) return 1;
  return Math.max(0, Math.min(1, (t - start) / dur));
}

function progressOutWindow(t: number, end: number, dur: number) {
  if (dur <= 0) return 1;
  return Math.max(0, Math.min(1, (end - t) / dur));
}

function styleForTransition(
  name: string,
  p: number // 0..1
): React.CSSProperties {
  // default “none”
  if (!name || name === "none") return {};

  // normalize sizes
  const clamp = (x: number) => Math.max(0, Math.min(1, x));

  switch (name) {
    case "fade-sm":
    case "fade-md":
    case "fade-lg": {
      // simple opacity ramp
      return { opacity: clamp(p) };
    }
    case "scale-in-center": {
      const s = 0.85 + 0.15 * clamp(p); // from 0.85 → 1.0
      return { transform: `scale(${s})`, opacity: clamp(p) };
    }
    case "scale-out-center": {
      const s = 1.0 - 0.15 * (1 - clamp(p)); // toward 0.85
      return { transform: `scale(${s})`, opacity: clamp(p) };
    }
    case "slide-in-left": {
      const tx = (1 - clamp(p)) * -20; // px
      return { transform: `translateX(${tx}px)`, opacity: clamp(p) };
    }
    case "slide-in-right": {
      const tx = (1 - clamp(p)) * 20;
      return { transform: `translateX(${tx}px)`, opacity: clamp(p) };
    }
    case "slide-out-left": {
      const tx = (1 - clamp(p)) * 20;
      return { transform: `translateX(${tx}px)`, opacity: clamp(p) };
    }
    case "slide-out-right": {
      const tx = (1 - clamp(p)) * -20;
      return { transform: `translateX(${tx}px)`, opacity: clamp(p) };
    }
    default:
      return {};
  }
}

function computeGraphicTransitionStyle(
  g: GraphicTimelineClip,
  now: number
): React.CSSProperties {
  const start =
    typeof (g as any).startTime === "number"
      ? (g as any).startTime
      : (g as any).start ?? 0;
  const end =
    typeof (g as any).endTime === "number"
      ? (g as any).endTime
      : typeof (g as any).duration === "number"
      ? start + (g as any).duration
      : undefined;

  const tr = g.transitions || {};
  let style: React.CSSProperties = {};

  // IN transition
  if (tr.in) {
    const pin = ease(
      progressInWindow(now, start, tr.in.duration ?? 0.3),
      tr.in.easing
    );
    style = { ...style, ...styleForTransition(tr.in.type, pin) };
  }

  // OUT transition
  if (tr.out && typeof end === "number") {
    const pout = ease(
      progressOutWindow(now, end, tr.out.duration ?? 0.3),
      tr.out.easing
    );
    // For “out” we invert: when we are far from end, p=1 (no effect); near end p→0
    // So reuse same style function with `pout`.
    const outStyle = styleForTransition(tr.out.type, pout);
    style = { ...style, ...outStyle };
  }

  // Important so transforms combine nicely with your existing positioning
  style.willChange = "transform, opacity";
  return style;
}

/* ============================ Component ============================ */
export function PreviewWindow({
  clips,
  audioTracks,
  backgroundTracks,
  graphics,
  tracks,
  currentTime,
  isPlaying,
  customThumbnails,
  onClipsUpdate,
  onGraphicsUpdate,
}: PreviewWindowProps) {
  const tol = 0.001;

  /* ---------- local UI state (controls / snap / guides) ---------- */
  const [showControls, setShowControls] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  /* ---------------- pick active items at currentTime --------------- */
  const [activeClips, setActiveClips] = useState<TimelineClip[]>([]);
  const [activeAudioTracks, setActiveAudioTracks] = useState<AudioTrack[]>([]);
  const [activeGraphics, setActiveGraphics] = useState<GraphicTimelineClip[]>([]);
  const [activeBackgrounds, setActiveBackgrounds] = useState<AnyBackground[]>([]);

  // export-mode tracking (updates when ProjectIOButtons flips body attr)
  const [exportMode, setExportMode] = useState(
    typeof document !== "undefined" && document.body.getAttribute("data-exporting") === "true"
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const target = document.body;
    const obs = new MutationObserver(() => {
      setExportMode(target.getAttribute("data-exporting") === "true");
    });
    obs.observe(target, { attributes: true, attributeFilter: ["data-exporting"] });
    return () => obs.disconnect();
  }, []);

  const srcClips = useMemo(() => {
    if (clips && clips.length) return clips;
    const all = (tracks || []).flatMap((t) => Array.isArray(t.clips) ? t.clips : []);
    return all.filter((c: any) =>
      typeof c?.animationId === "string" ||
      ["fade", "slide", "zoom", "rotate", "bounce", "elastic"].includes(c?.type)
    ) as TimelineClip[];
  }, [clips, tracks]);

  const srcGraphics = useMemo(() => {
    if (graphics && graphics.length) return graphics;
    const all = (tracks || []).flatMap((t) => Array.isArray(t.clips) ? t.clips : []);
    return all.filter((c: any) => c?.graphicId || c?.type === "text") as GraphicTimelineClip[];
  }, [graphics, tracks]);

  useEffect(() => {
    setActiveClips((srcClips || []).filter(c => isActiveAt(c, currentTime, tol)));
  }, [srcClips, currentTime]);

  useEffect(() => {
    setActiveAudioTracks((audioTracks || []).filter(t => isActiveAt(t, currentTime, tol)));
  }, [audioTracks, currentTime]);

  useEffect(() => {
    setActiveGraphics((srcGraphics || []).filter(g => isActiveAt(g, currentTime, tol)));
  }, [srcGraphics, currentTime]);

  useEffect(() => {
    const unified = extractBackgrounds(backgroundTracks, srcGraphics)
      .filter(bg => isActiveAt(bg.raw ?? {}, currentTime, tol));
    setActiveBackgrounds(unified);
  }, [backgroundTracks, srcGraphics, currentTime]);

  /* -------------------- selection & store fallback ------------------- */
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [selectedGraphic, setSelectedGraphic] = useState<string | null>(null);

  const store = useTimelineStore();
  const setTracks = store?.setTracks;

  const patchClipInTracks = useCallback(
    (id: string, patch: Partial<TimelineClip>) => {
      if (!tracks || !setTracks) return;
      const newTracks = tracks.map((t) => {
        if (!Array.isArray(t.clips)) return t;
        let changed = false;
        const newClips = t.clips.map((c: any) => {
          if (c?.id === id) { changed = true; return { ...c, ...patch }; }
          return c;
        });
        return changed ? { ...t, clips: newClips } : t;
      });
      setTracks(newTracks);
    },
    [tracks, setTracks]
  );

  const patchGraphicInTracks = useCallback(
    (id: string, patch: Partial<GraphicTimelineClip>) => {
      if (!tracks || !setTracks) return;
      const newTracks = tracks.map((t) => {
        if (!Array.isArray(t.clips)) return t;
        let changed = false;
        const newClips = t.clips.map((c: any) => {
          if (c?.id === id) { changed = true; return { ...c, ...patch }; }
          return c;
        });
        return changed ? { ...t, clips: newClips } : t;
      });
      setTracks(newTracks);
    },
    [tracks, setTracks]
  );

  const updateClip = useCallback(
    (id: string, patch: Partial<TimelineClip>) => {
      if (onClipsUpdate) onClipsUpdate((clips || []).map(c => (c.id === id ? { ...c, ...patch } : c)));
      else patchClipInTracks(id, patch);
    },
    [clips, onClipsUpdate, patchClipInTracks]
  );
  const updateGraphic = useCallback(
    (id: string, patch: Partial<GraphicTimelineClip>) => {
      if (onGraphicsUpdate) onGraphicsUpdate((graphics || []).map(g => (g.id === id ? { ...g, ...patch } : g)));
      else patchGraphicInTracks(id, patch);
    },
    [graphics, onGraphicsUpdate, patchGraphicInTracks]
  );

  /* ------------------- Inline text editor: font controls ------------------- */
  // Font choices (must match the names loaded via <link> in index.html)
  const FONT_CHOICES = useMemo(
    () => ["Poppins", "Public Sans", "Lexend", "Bree Serif", "Coming Soon", "Lato", "Londrina Solid", "Caveat Brush"],
    []
  );

  const handleFontFamilyChange = useCallback(
    (graphicId: string, family: string) => {
      if (!graphicId) return;
      const normalized = sanitizeFontFamilyName(family) || DEFAULT_FONT_FAMILY;
      updateGraphic(graphicId, { fontFamily: normalized });
    },
    [updateGraphic]
  );

  // track per-clip desired times & handlers (export-mode only)
  const desiredTimeRef = useRef<Record<string, number>>({});
  const seekHandlerRef = useRef<Record<string, (ev?: Event) => void>>({});
  const drawingLockRef = useRef<Record<string, boolean>>({});

  const drawOnce = (video: HTMLVideoElement, canvas: HTMLCanvasElement, clipId: string) => {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return;
  if (canvas.width !== vw || canvas.height !== vh) { canvas.width = vw; canvas.height = vh; }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(video, 0, 0);

  // (optional matte kept only for preview; disable in export to avoid timing cost)
  // no-op here because export uses this path.
  };

  const seekAndDrawForExport = (clipId: string, video: HTMLVideoElement, canvas?: HTMLCanvasElement, t?: number) => {
  if (!canvas) return;
  // prevent overlapping handlers
  if (drawingLockRef.current[clipId]) return;
  drawingLockRef.current[clipId] = true;

  const targetT = typeof t === "number" ? t : video.currentTime;
  desiredTimeRef.current[clipId] = targetT;

  const doDraw = () => {
    // only draw if we reached (or very near) the desired time
    const want = desiredTimeRef.current[clipId];
    if (typeof want === "number" && Math.abs(video.currentTime - want) > 0.02) {
      drawingLockRef.current[clipId] = false;
      return; // another seek will come
    }
    drawOnce(video, canvas, clipId);
    drawingLockRef.current[clipId] = false;
  };

  // Prefer rVFC if available (fires when a decoded frame is ready)
  const anyVid = video as any;
  if (typeof anyVid.requestVideoFrameCallback === "function") {
    anyVid.requestVideoFrameCallback(() => doDraw());
  } else {
    // Fallback: wait for 'seeked' then draw
    // Remove any previous handler
    if (seekHandlerRef.current[clipId]) {
      video.removeEventListener("seeked", seekHandlerRef.current[clipId]!);
      delete seekHandlerRef.current[clipId];
    }
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      delete seekHandlerRef.current[clipId];
      doDraw();
    };
    seekHandlerRef.current[clipId] = onSeeked;
    video.addEventListener("seeked", onSeeked, { once: true });
  }
  };

  /* -------------------------- container, snap -------------------------- */
  const containerRef = useRef<HTMLDivElement | null>(null);
  const getNormRect = (x?: number, y?: number, width?: number, height?: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const cw = rect?.width ?? 1;
    const ch = rect?.height ?? 1;
    return {
      x: toUnit(x, cw, 0),
      y: toUnit(y, ch, 0),
      w: toUnit(width, cw, 0.4),
      h: toUnit(height, ch, 0.4),
      cw, ch
    };
  };

  const snapVal = (v: number) => {
    if (!snapEnabled) return v;
    const guides = [0, 1/6, 1/4, 1/3, 0.5, 2/3, 3/4, 5/6, 1];
    const thresh = 0.015; // ~1.5%
    let best = v, bestD = Infinity;
    for (const g of guides) {
      const d = Math.abs(v - g);
      if (d < bestD && d <= thresh) { best = g; bestD = d; }
    }
    return best;
  };

  /* --------------------------- interactions --------------------------- */
  const modeRef = useRef<Mode>({ kind: "idle" });
  const endInteraction = useCallback(() => { modeRef.current = { kind: "idle" }; }, []);

  useEffect(() => {
    const move = (clientX: number, clientY: number) => {
      const m = modeRef.current;
      if (m.kind === "idle") return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      let mx = clamp01((clientX - rect.left) / rect.width);
      let my = clamp01((clientY - rect.top) / rect.height);

      const MIN = 0.05;

      if (m.kind === "drag-clip" || m.kind === "drag-graphic") {
        let nx = mx - m.offsetXNorm;
        let ny = my - m.offsetYNorm;
        nx = Math.max(0, Math.min(nx, 1 - m.w));
        ny = Math.max(0, Math.min(ny, 1 - m.h));
        nx = snapVal(nx);
        ny = snapVal(ny);
        if (m.kind === "drag-clip") updateClip(m.id, { x: nx, y: ny });
        else updateGraphic(m.id, { x: nx, y: ny });
        return;
      }

      if (m.kind === "resize-clip" || m.kind === "resize-graphic") {
        let { startX, startY, startW, startH } = m;
        let newX = startX;
        let newY = startY;
        let newW = startW;
        let newH = startH;

        switch (m.handle) {
          case "se": newW = Math.max(MIN, mx - startX); newH = Math.max(MIN, my - startY); break;
          case "sw": newW = Math.max(MIN, startX + startW - mx); newH = Math.max(MIN, my - startY); newX = startX + startW - newW; break;
          case "ne": newW = Math.max(MIN, mx - startX); newH = Math.max(MIN, startY + startH - my); newY = startY + startH - newH; break;
          case "nw": newW = Math.max(MIN, startX + startW - mx); newH = Math.max(MIN, startY + startH - my); newX = startX + startW - newW; newY = startY + startH - newH; break;
        }

        newW = Math.min(newW, 1 - newX);
        newH = Math.min(newH, 1 - newY);
        newX = snapVal(newX);
        newY = snapVal(newY);

        if (m.kind === "resize-clip") updateClip(m.id, { x: newX, y: newY, width: newW, height: newH });
        else updateGraphic(m.id, { x: newX, y: newY, width: newW, height: newH });
      }
    };

    const onPointerMove = (e: PointerEvent) => move(e.clientX, e.clientY);
    const onMouseMove = (e: MouseEvent) => move(e.clientX, e.clientY);
    const onUp = () => endInteraction();

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("mouseup", onUp);
    };
  }, [endInteraction, updateClip, updateGraphic, snapEnabled]);

  const beginDragClip = (e: React.PointerEvent | React.MouseEvent, clip: TimelineClip) => {
    e.preventDefault(); e.stopPropagation();
    const { w, h, cw, ch } = getNormRect(clip.x, clip.y, clip.width, clip.height);
    const elRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetXNorm = clamp01((("clientX" in e ? e.clientX : (e as any).clientX) - elRect.left) / cw);
    const offsetYNorm = clamp01((("clientY" in e ? e.clientY : (e as any).clientY) - elRect.top) / ch);
    modeRef.current = { kind: "drag-clip", id: clip.id, w, h, offsetXNorm, offsetYNorm };
    setSelectedClip(clip.id); setSelectedGraphic(null);
  };
  const beginDragGraphic = (e: React.PointerEvent | React.MouseEvent, g: GraphicTimelineClip) => {
    e.preventDefault(); e.stopPropagation();
    const { w, h, cw, ch } = getNormRect(g.x, g.y, g.width, g.height);
    const elRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetXNorm = clamp01((("clientX" in e ? e.clientX : (e as any).clientX) - elRect.left) / cw);
    const offsetYNorm = clamp01((("clientY" in e ? e.clientY : (e as any).clientY) - elRect.top) / ch);
    modeRef.current = { kind: "drag-graphic", id: g.id, w, h, offsetXNorm, offsetYNorm };
    setSelectedGraphic(g.id); setSelectedClip(null);
  };
  const beginResize = (
    e: React.PointerEvent | React.MouseEvent,
    subject: "clip" | "graphic",
    id: string,
    handle: Handle,
    rectVals: { x?: number; y?: number; width?: number; height?: number }
  ) => {
    e.preventDefault(); e.stopPropagation();
    const { x, y, w, h } = getNormRect(rectVals.x, rectVals.y, rectVals.width, rectVals.height);
    modeRef.current = subject === "clip"
      ? { kind: "resize-clip", id, startX: x, startY: y, startW: w, startH: h, handle }
      : { kind: "resize-graphic", id, startX: x, startY: y, startW: w, startH: h, handle };
  };

  /* --------------------------- video previews --------------------------- */
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const animationFrameRefs = useRef<Record<string, number>>({});

  const processVideoFrame = (video: HTMLVideoElement, canvas: HTMLCanvasElement, clipId: string) => {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (vw === 0 || vh === 0) return;

    // Only (re)allocate if the source size changed
    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);

    // Optional matte processing (kept from your version). Skip if exportMode to reduce cost/flicker.
    if (!exportMode) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < 30) data[i + 3] = 0;
        else if (lum < 60) data[i + 3] = Math.floor((lum - 30) * 8.5);
      }
      ctx.putImageData(imageData, 0, 0);
    }

    if ((isPlaying || exportMode) && !video.paused) {
      animationFrameRefs.current[clipId] = requestAnimationFrame(() =>
        processVideoFrame(video, canvas, clipId)
      );
    }
  };

  useEffect(() => {
  Object.entries(videoRefs.current).forEach(([clipId, video]) => {
    if (!video) return;
    const clip = (srcClips || []).find(c => c.id === clipId);
    if (!clip) return;

    const { start, end } = normalizeWindow(clip);
    const dur = Math.max(0, (end ?? start) - start);
    const prog = currentTime - start;
    const active = prog >= 0 && (end == null ? true : prog <= dur);
    const targetT = dur > 0 ? clamp01(prog / dur) * (video.duration || 0) : 0;

    const cv = canvasRefs.current[clipId];
    const videoPreviewUrls = JSON.parse(localStorage.getItem("videoPreviewUrls") || "{}");
    const originalClipId = clip.animationId || clip.id.replace(/-\d+$/, "");
    const videoUrl = videoPreviewUrls[originalClipId] || videoPreviewUrls[clip.id];

    if (!active || !videoUrl) {
      // ensure stopped & no RAF
      if (!video.paused) video.pause();
      if (animationFrameRefs.current[clipId]) {
        cancelAnimationFrame(animationFrameRefs.current[clipId]);
        delete animationFrameRefs.current[clipId];
      }
      return;
    }

    // ensure src
    if (video.src !== videoUrl) video.src = videoUrl;

    if (exportMode) {
      // EXPORT MODE: no play, precise seek -> draw-on-ready
      if (!video.paused) { try { video.pause(); } catch {} }

      // Only seek if we need to
      if (!Number.isFinite(targetT)) return;
      if (Math.abs(video.currentTime - targetT) > 0.01) {
        try { video.currentTime = Math.max(0, Math.min(targetT, (video.duration || 0) - 0.000001)); } catch {}
      }
      seekAndDrawForExport(clipId, video, cv, targetT);
    } else {
      // LIVE PREVIEW: play + RAF pipeline (your existing behavior)
      if (Number.isFinite(targetT) && Math.abs(video.currentTime - targetT) > 0.05) {
        try { video.currentTime = targetT; } catch {}
      }
      if (video.readyState >= 2) {
        if (video.paused) { video.play().catch(() => {}); }
        if (cv) {
          // RAF loop for preview
          const tick = () => {
            processVideoFrame(video, cv, clipId);
          };
          if (!animationFrameRefs.current[clipId]) {
            animationFrameRefs.current[clipId] = requestAnimationFrame(tick);
          }
        }
      }
    }
  });

  return () => {
    // cleanup per pass – cancel any leftover RAFs
    Object.entries(animationFrameRefs.current).forEach(([id, raf]) => {
      cancelAnimationFrame(raf);
      delete animationFrameRefs.current[id];
    });
  };
  }, [isPlaying, currentTime, srcClips, exportMode]);


  useEffect(() => {
    const currentClipIds = new Set(activeClips.map(c => c.id));
    Object.keys(videoRefs.current).forEach(id => {
      if (!currentClipIds.has(id)) {
        if (animationFrameRefs.current[id]) {
          cancelAnimationFrame(animationFrameRefs.current[id]);
          delete animationFrameRefs.current[id];
        }
        delete videoRefs.current[id];
        delete canvasRefs.current[id];
      }
    });
  }, [activeClips]);

  useEffect(() => {
    return () => { Object.values(animationFrameRefs.current).forEach(frameId => cancelAnimationFrame(frameId)); };
  }, []);

  /* ---------------------------- duration readout ---------------------------- */
  const totalDuration = useMemo(() => {
    const endsFromClips = (srcClips || []).map((c) => {
      const { start, end } = normalizeWindow(c as any);
      return end ?? start;
    });
    const endsFromAudio = (audioTracks || []).map((t) => {
      const { start, end } = normalizeWindow(t as any);
      return end ?? start;
    });
    const endsFromBackgrounds = (backgroundTracks || []).flatMap((t: any) => {
      const items = Array.isArray(t?.clips) ? t.clips : [t];
      return items.map((c: any) => {
        const { start, end } = normalizeWindow(c);
        return end ?? start;
      });
    });
    const endsFromGraphics = (srcGraphics || []).map((g) => {
      const { start, end } = normalizeWindow(g as any);
      return end ?? start;
    });
    return Math.max(0, ...endsFromClips, ...endsFromAudio, ...endsFromBackgrounds, ...endsFromGraphics);
  }, [srcClips, audioTracks, backgroundTracks, srcGraphics]);

  const galleryThumbs = useMemo(
    () => JSON.parse(localStorage.getItem("customThumbnails") || "{}"),
    []
  );

  /* ------------------------------- alignment ------------------------------- */
  const alignSelected = (pos: "left"|"hcenter"|"right"|"top"|"vcenter"|"bottom") => {
    const targetId = selectedClip || selectedGraphic;
    if (!targetId) return;
    const rect = containerRef.current?.getBoundingClientRect();
    const cw = rect?.width ?? 1; const ch = rect?.height ?? 1;

    // find the selected object
    const clip = (srcClips || []).find(c => c.id === targetId);
    const g = (srcGraphics || []).find(x => x.id === targetId);
    const isClip = !!clip;

    const current = (isClip ? clip : g) as any;
    if (!current) return;

    const w = typeof current.width === "number" ? current.width : 0.4;
    const h = typeof current.height === "number" ? current.height : 0.4;

    let x = typeof current.x === "number" ? current.x : 0;
    let y = typeof current.y === "number" ? current.y : 0;

    const norm = (val: number, total: number) => (val > 1 ? val / total : val);

    const nw = norm(w, cw);
    const nh = norm(h, ch);

    switch (pos) {
      case "left":    x = 0; break;
      case "hcenter": x = clamp01(0.5 - nw / 2); break;
      case "right":   x = clamp01(1 - nw); break;
      case "top":     y = 0; break;
      case "vcenter": y = clamp01(0.5 - nh / 2); break;
      case "bottom":  y = clamp01(1 - nh); break;
    }

    if (isClip) updateClip(current.id, { x, y });
    else updateGraphic(current.id, { x, y });
  };

  /* text editing switch */
  const [editingGraphicId, setEditingGraphicId] = useState<string | null>(null);
  const [editingGraphicDraft, setEditingGraphicDraft] = useState<string>("");
  const editingGraphicOriginal = useRef<string>("");
  const graphicEditorRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const graphicCaretOffsets = useRef<Record<string, number>>({});

  const finalizeGraphicTextEdit = useCallback(
    (graphicId: string, finalText: string) => {
      if (!graphicId) return;
      setEditingGraphicDraft(finalText);
      if (finalText !== editingGraphicOriginal.current) {
        updateGraphic(graphicId, { content: finalText });
      }
      editingGraphicOriginal.current = "";
      setEditingGraphicId((prev) => (prev === graphicId ? null : prev));
      delete graphicCaretOffsets.current[graphicId];
    },
    [updateGraphic]
  );

  const beginGraphicTextEdit = useCallback(
    (graphic: GraphicTimelineClip) => {
      if (!graphic) return;
      if (editingGraphicId && editingGraphicId !== graphic.id) {
        finalizeGraphicTextEdit(editingGraphicId, editingGraphicDraft);
      }
      setSelectedGraphic(graphic.id);
      setEditingGraphicId(graphic.id);
      setEditingGraphicDraft(graphic.content ?? "");
      editingGraphicOriginal.current = graphic.content ?? "";
      graphicCaretOffsets.current[graphic.id] = (graphic.content ?? "").length;
      requestAnimationFrame(() => {
        const node = graphicEditorRefs.current[graphic.id];
        if (node) {
          try {
            node.focus();
            const range = document.createRange();
            range.selectNodeContents(node);
            range.collapse(false);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            graphicCaretOffsets.current[graphic.id] = (node.textContent ?? "").length;
          } catch {}
        }
      });
    },
    [editingGraphicDraft, editingGraphicId, finalizeGraphicTextEdit, setSelectedGraphic]
  );

  useEffect(() => {
    if ((!showControls || exportMode) && editingGraphicId) {
      finalizeGraphicTextEdit(editingGraphicId, editingGraphicDraft);
      graphicCaretOffsets.current = {};
    }
  }, [showControls, exportMode, editingGraphicId, editingGraphicDraft, finalizeGraphicTextEdit]);

  /* --------------------------------- render --------------------------------- */
  return (
    <div className="bg-card border-b border-border flex flex-col">
      {/* Header */}
      <div className="p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Preview Window</h2>
            {activeAudioTracks.length > 0 && (
              <div className="flex items-center mt-1 gap-1">
                <span className="text-xs text-muted-foreground">Audio:</span>
                {activeAudioTracks.map((track) => (
                  <span key={track.id} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                    {track.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="text-sm font-mono text-muted-foreground">
            {currentTime.toFixed(2)}s / {totalDuration.toFixed(2)}s
          </div>
        </div>
      </div>

      {/* Stage */}
      <div className="p-4 flex justify-center">
        <div className="w-full max-w-2xl">
          <div
            id="preview-stage"
            className="relative border-2 border-dashed border-timeline-grid/30 rounded-lg aspect-video w-full overflow-hidden"
            style={{ touchAction: "none" }}
            onMouseDown={(e) => { if( !editingGraphicId) e.preventDefault(); }}
            onPointerDown={(e) => { if (!editingGraphicId) e.preventDefault(); }}
            onDragStart={(e) => e.preventDefault()}
            data-controls={showControls && !exportMode ? "visible" : "hidden"}
          >
            {/* Toolbar (top-right) */}
            <div className="absolute top-2 right-2 z-30 flex gap-1" data-export-hide>
              <button
                className="px-2 py-1 text-xs rounded bg-secondary/80 hover:bg-secondary"
                onClick={() => setShowControls((v) => !v)}
                title={showControls ? "Hide controls" : "Show controls"}
              >
                {showControls ? "Controls: On" : "Controls: Off"}
              </button>
              <button
                className="px-2 py-1 text-xs rounded bg-secondary/80 hover:bg-secondary"
                onClick={() => { setSnapEnabled((s) => !s); setShowGrid((g) => !g); }}
                title="Toggle snap-to-grid"
              >
                {snapEnabled ? "Snap: On" : "Snap: Off"}
              </button>

              {/* Align group */}
              <div className="flex gap-1 bg-secondary/70 rounded px-1">
                <button className="px-2 py-1 text-xs rounded hover:bg-secondary" onClick={() => alignSelected("left")}  title="Align left">⟸</button>
                <button className="px-2 py-1 text-xs rounded hover:bg-secondary" onClick={() => alignSelected("hcenter")} title="Align horizontal center">⇔</button>
                <button className="px-2 py-1 text-xs rounded hover:bg-secondary" onClick={() => alignSelected("right")} title="Align right">⟹</button>
                <button className="px-2 py-1 text-xs rounded hover:bg-secondary" onClick={() => alignSelected("top")}   title="Align top">⟰</button>
                <button className="px-2 py-1 text-xs rounded hover:bg-secondary" onClick={() => alignSelected("vcenter")} title="Align vertical center">⇕</button>
                <button className="px-2 py-1 text-xs rounded hover:bg-secondary" onClick={() => alignSelected("bottom")} title="Align bottom">⟱</button>
              </div>
            </div>

            {/* Grid overlay (only when snapping on and asked to show) */}
            {showGrid && !exportMode && (
              <div
                className="pointer-events-none absolute inset-0 z-5"
                data-export-hide
                style={{
                  background:
                    `repeating-linear-gradient(to right, rgba(255,255,255,.06) 0 1px, transparent 1px 12.5%),` +
                    `repeating-linear-gradient(to bottom, rgba(255,255,255,.06) 0 1px, transparent 1px 12.5%)`,
                }}
              />
            )}

            {/* Background layer */}
            <div className="absolute inset-0 z-0">
              {activeBackgrounds.map((bg) => {
                const style: React.CSSProperties = {};
                if (bg.kind === "gradient" && bg.gradientColors?.length) {
                  const direction = bg.gradientDirection || "to right";
                  style.background = `linear-gradient(${direction}, ${bg.gradientColors.join(", ")})`;
                } else if (bg.kind === "color") {
                  style.backgroundColor = bg.color || "#000000";
                } else if (bg.kind === "image" && bg.imageUrl) {
                  const fit = bg.fit || "cover";
                  style.backgroundImage = `url(${bg.imageUrl})`;
                  style.backgroundSize = fit === "repeat" ? "auto" : fit;
                  style.backgroundRepeat = fit === "repeat" ? "repeat" : "no-repeat";
                  style.backgroundPosition = "center";
                }
                return <div key={bg.id} className="absolute inset-0" style={style} />;
              })}
            </div>

            {/* Clips/graphics layer */}
            <div
              ref={containerRef}
              className="absolute inset-0 p-4 z-10"
              onPointerDown={() => {
                 setSelectedClip(null); 
                 setSelectedGraphic(null);
                 setEditingGraphicId(null); 
              }}
              onMouseDown={() => { 
                setSelectedClip(null); 
                setSelectedGraphic(null);
                setEditingGraphicId(null);
              }}
            >
              {/* hidden <video> elements for frame extraction */}
              {(srcClips || []).map((clip) => {
                const videoPreviewUrls = JSON.parse(localStorage.getItem("videoPreviewUrls") || "{}");
                const originalClipId = clip.animationId || clip.id.replace(/-\d+$/, "");
                const videoUrl = videoPreviewUrls[originalClipId] || videoPreviewUrls[clip.id];
                return videoUrl ? (
                  <video
                    key={`preload-${clip.id}`}
                    ref={(ref) => { if (ref) videoRefs.current[clip.id] = ref; }}
                    src={videoUrl}
                    className="absolute top-0 left-0 w-1 h-1 opacity-0 pointer-events-none"
                    muted playsInline preload="auto"
                  />
                ) : null;
              })}

              {/* Action Clips */}
              {activeClips.slice(0, 8).map((clip) => {
                const videoPreviewUrls = JSON.parse(localStorage.getItem("videoPreviewUrls") || "{}");
                const originalClipId = clip.animationId || clip.id.replace(/-\d+$/, "");
                const videoUrl = videoPreviewUrls[originalClipId] || videoPreviewUrls[clip.id];

                const left = pctOrPx(clip.x, 0);
                const top = pctOrPx(clip.y, 0);
                const width = pctOrPx(clip.width, 0.4);
                const height = pctOrPx(clip.height, 0.4);

                const thumb =
                  customThumbnails?.[originalClipId] ||
                  customThumbnails?.[clip.animationId] ||
                  customThumbnails?.[clip.animationId || clip.id] ||
                  (galleryThumbs as any)[originalClipId] ||
                  (galleryThumbs as any)[clip.animationId] ||
                  (galleryThumbs as any)[clip.animationId || clip.id];

                const controlsVisible = showControls && !exportMode;

                return (
                  <div
                    key={clip.id}
                    className={`absolute select-none ${controlsVisible && selectedClip === clip.id ? "ring-2 ring-primary aa-frame" : "aa-frame"}`}
                    style={{ left, top, width, height, touchAction: "none", cursor: controlsVisible ? "move" : "default" }}
                    onPointerDown={(e) => controlsVisible && beginDragClip(e, clip)}
                    onMouseDown={(e) => controlsVisible && beginDragClip(e, clip)}
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                  >
                    {videoUrl && (
                      <canvas
                        ref={(ref) => { canvasRefs.current[clip.id] = ref; }}
                        className="absolute inset-0 w-full h-full object-cover rounded pointer-events-none"
                        style={{ transform: "translateZ(0)", willChange: "transform" }}
                      />
                    )}

                    <div className="absolute inset-0 rounded border border-transparent hover:border-primary/40 flex items-center justify-center pointer-events-none">
                      {!videoUrl ? (
                        thumb ? (
                          <img src={thumb} alt={clip.name} className="max-w-full max-h-full object-contain rounded" />
                        ) : (
                          <div className="text-center">
                            <div className="text-2xl mb-1">{getClipIcon(clip.type)}</div>
                            <div className="text-xs font-semibold text-primary">{clip.type.toUpperCase()}</div>
                            <div className="text-[10px] text-muted-foreground mt-1">{clip.name}</div>
                          </div>
                        )
                      ) : null}
                    </div>

                    {controlsVisible && (["nw","ne","sw","se"] as Handle[]).map((h) => {
                      const pos =
                        h === "nw" ? "top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nw-resize" :
                        h === "ne" ? "top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-ne-resize" :
                        h === "sw" ? "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-sw-resize" :
                                     "bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-se-resize";
                      return (
                        <div
                          key={h}
                          className={`aa-handle absolute w-3 h-3 bg-primary rounded-sm border border-primary-foreground ${pos}`}
                          style={{ pointerEvents: "auto" }}
                          onPointerDown={(e) => beginResize(e, "clip", clip.id, h, clip)}
                          onMouseDown={(e) => beginResize(e, "clip", clip.id, h, clip)}
                        />
                      );
                    })}
                  </div>
                );
              })}

              {/* Graphics */}
              {activeGraphics.map((g) => {
                const left = pctOrPx(g.x, 0);
                const top = pctOrPx(g.y, 0);
                const width = pctOrPx(g.width, 0.3);
                const height = pctOrPx(g.height, 0.3);
                const gThumb = customThumbnails?.[g.graphicId || g.id];
                const baseStyle: React.CSSProperties = {
                    position: "absolute",
                    left: left, top: top, width: width, height: height,
                    display: "flex", alignItems: "center", justifyContent: "center",
                };
                const controlsVisible = showControls && !exportMode;
                const fontSizePx   = Math.round(g.fontSize ?? 24);
                const lineHeightPx = Math.round(
                  // prefer an explicit lineHeight you may store
                  (g as any).lineHeightPx ??
                  (g as any).lineHeight ??
                  fontSizePx * 1.2
                );
                const isEditing = editingGraphicId === g.id;
                const displayText = (isEditing ? editingGraphicDraft : (g.content ?? "")).toString();
                const isSingleLine = !/\r|\n/.test(displayText);
                const textAlign = (g as any).textAlign || "center";
                const resolvedClipFontFamily = resolveGraphicFontFamily(g);
                const fontStack = buildFontStack(resolvedClipFontFamily);
                const fontWeightLabel = normalizeFontWeightLabel((g as any)?.fontWeight ?? DEFAULT_FONT_WEIGHT_LABEL);
                const fontWeightValue = fontWeightLabelToCss(fontWeightLabel);
                const singleLineJustify =
                  textAlign === "left" ? "flex-start" :
                  textAlign === "right" ? "flex-end" :
                  textAlign === "justify" ? "space-between" :
                  "center";
                const frameJustifyContent =
                  textAlign === "left" ? "flex-start" :
                  textAlign === "right" ? "flex-end" :
                  textAlign === "justify" ? "space-between" :
                  "center";

                const trStyle = computeGraphicTransitionStyle(g, currentTime); 

                return (
                  <div
                    key={g.id}
                    className={`absolute select-none ${controlsVisible && selectedGraphic === g.id ? "ring-2 ring-yellow-400 aa-frame" : "aa-frame"}`}
                    style={{
                      left, top, width, height, touchAction: "none", cursor: controlsVisible ? "move" : "default" }}
                    onPointerDown={(e) => {
                        if (editingGraphicId) return; // don't drag while editing
                        const isEditable = (e.target as HTMLElement)?.closest?.('[data-editable="true"]');
                        if (isEditable) return; // let text get focus/caret
                        controlsVisible && beginDragGraphic(e, g);
                      }}
                    onMouseDown={(e) => {
                        if (editingGraphicId) return;
                        const isEditable = (e.target as HTMLElement)?.closest?.('[data-editable="true"]');
                        if (isEditable) return;
                        controlsVisible && beginDragGraphic(e, g);
                      }}
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                  >
                    <div
                      className="absolute inset-0 rounded border border-transparent hover:border-yellow-400/40 flex items-center"
                      style={{ justifyContent: g.type === "text" ? frameJustifyContent : "center" }}
                    >
                     {g.type === "text" ? (
                      <>
                        <div
                          data-editable="true"
                          data-textnode="1"
                          contentEditable={controlsVisible}
                          suppressContentEditableWarning
                          tabIndex={controlsVisible ? 0 : -1}
                          ref={(node) => {
                            if (!node) {
                              delete graphicEditorRefs.current[g.id];
                              return;
                            }
                            graphicEditorRefs.current[g.id] = node;
                          }}
                          className="font-semibold break-words px-2 outline-none"
                          style={{
                            fontSize: `${fontSizePx}px`,
                            color: g.textColor || "#000",
                            backgroundColor: (g as any).bgColor ?? "transparent",
                            borderRadius: `${(g as any).radius ?? 0}px`,
                            padding: (g as any).bgColor ? "6px 10px" : undefined,
                            fontWeight: fontWeightValue,
                            textAlign,
                            fontFamily: fontStack,
                            lineHeight:`${lineHeightPx}px`,
                            userSelect: controlsVisible ? "text" : "none",
                            cursor: controlsVisible ? "text" : "default",
                            whiteSpace: "pre-wrap",
                            display: isSingleLine ? "flex" : undefined,
                            alignItems: isSingleLine ? "center" : undefined,
                            justifyContent: isSingleLine ? singleLineJustify : undefined,
                          }}
                          onPointerDown={(e) => {
                            if (!controlsVisible) return;
                            e.stopPropagation();
                            beginGraphicTextEdit(g);
                          }}
                          onMouseDown={(e) => {
                            if (!controlsVisible) return;
                            e.stopPropagation();
                            beginGraphicTextEdit(g);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onInput={(e) => {
                            const target = e.currentTarget;
                            const selection = window.getSelection();
                            if (selection && selection.rangeCount > 0) {
                              try {
                                const range = selection.getRangeAt(0).cloneRange();
                                range.setStart(target, 0);
                                graphicCaretOffsets.current[g.id] = range.toString().length;
                              } catch {
                                delete graphicCaretOffsets.current[g.id];
                              }
                            }
                            const nextText = target.textContent ?? "";
                            if (editingGraphicId === g.id) {
                              setEditingGraphicDraft(nextText);
                            }
                            requestAnimationFrame(() => {
                              const offset = graphicCaretOffsets.current[g.id];
                              if (offset == null) return;
                              const node = graphicEditorRefs.current[g.id];
                              const sel = window.getSelection();
                              if (!node || !sel) return;
                              const totalText = node.textContent ?? "";
                              let remaining = Math.max(0, Math.min(offset, totalText.length));
                              const TEXT_NODE = typeof NodeFilter !== "undefined" ? NodeFilter.SHOW_TEXT : 4;
                              const walker = document.createTreeWalker(node, TEXT_NODE, null);
                              let textNode = walker.nextNode() as Text | null;
                              let anchorNode: Node = node;
                              let anchorOffset = node.childNodes.length;
                              while (textNode) {
                                const len = textNode.textContent?.length ?? 0;
                                if (remaining <= len) {
                                  anchorNode = textNode;
                                  anchorOffset = remaining;
                                  break;
                                }
                                remaining -= len;
                                textNode = walker.nextNode() as Text | null;
                              }
                              try {
                                const range = document.createRange();
                                if (anchorNode instanceof Text) {
                                  range.setStart(anchorNode, Math.min(anchorOffset, anchorNode.textContent?.length ?? 0));
                                } else {
                                  range.selectNodeContents(node);
                                  range.collapse(false);
                                }
                                range.collapse(true);
                                sel.removeAllRanges();
                                sel.addRange(range);
                                graphicCaretOffsets.current[g.id] = offset;
                              } catch {}
                            });
                          }}
                          onBlur={(e) => {
                            const next = e.currentTarget.textContent ?? "";
                            if (editingGraphicId === g.id) {
                              setEditingGraphicDraft(next);
                            }
                            finalizeGraphicTextEdit(g.id, next);
                          }}
                          spellCheck={true}
                        >
                          { displayText }
                        </div>
                        {/* tiny inline toolbar (only when selected & controls visible) */}
                        {showControls && !exportMode && selectedGraphic === g.id && (
                          <div
                            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 bg-secondary/90 backdrop-blur px-2 py-1 rounded shadow z-40"
                            style={{ top: "-28px" }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* content input */}
                            <input
                              type="text"
                              value={editingGraphicId === g.id ? editingGraphicDraft : (g.content ?? "")}
                              onChange={(e) => {
                                const next = e.target.value;
                                if (editingGraphicId === g.id) {
                                  setEditingGraphicDraft(next);
                                  graphicCaretOffsets.current[g.id] = next.length;
                                }
                                updateGraphic(g.id, { content: next });
                              }}
                              className="h-6 text-xs bg-background border rounded px-2 min-w-[120px]"
                              placeholder="Edit text…"
                              title="Text"
                            />
                            {/* font family */}
                            <select
                              className="h-6 text-xs bg-background border rounded px-1"
                              value={resolvedClipFontFamily}
                              onChange={(e) => handleFontFamilyChange(g.id, e.target.value)}
                              title="Font family"
                            >
                              <option value="" disabled>Select…</option>
                              {FONT_CHOICES.map((f) => (
                                <option key={f} value={f}>{f}</option>
                              ))}
                            </select>
                            {/* size */}
                            <input
                              type="number"
                              min={8}
                              max={200}
                              value={Math.round(g.fontSize ?? 24)}
                              onChange={(e) => updateGraphic(g.id, { fontSize: Number(e.target.value) })}
                              className="w-14 h-6 text-xs bg-background border rounded px-1"
                              title="Font size"
                            />
                            {/* color */}
                            <input
                              type="color"
                              value={g.textColor ?? "#000000"}
                              onChange={(e) => updateGraphic(g.id, { textColor: e.target.value })}
                              className="w-6 h-6 rounded border"
                              title="Text color"
                            />
                            {/* bold */}
                            <button
                              className="px-1 text-xs rounded hover:bg-background"
                              title="Bold"
                              onClick={() => {
                                const currentLabel = normalizeFontWeightLabel((g as any)?.fontWeight);
                                const nextLabel = currentLabel === "Bold" ? "Regular" : "Bold";
                                updateGraphic(g.id, { fontWeight: nextLabel } as any);
                              }}
                            >
                              B
                            </button>
                            {/* align */}
                            <button className="px-1 text-xs rounded hover:bg-background" title="Align left"   onClick={() => updateGraphic(g.id, { textAlign: "left" } as any)}>⟸</button>
                            <button className="px-1 text-xs rounded hover:bg-background" title="Align center" onClick={() => updateGraphic(g.id, { textAlign: "center" } as any)}>⇔</button>
                            <button className="px-1 text-xs rounded hover:bg-background" title="Align right"  onClick={() => updateGraphic(g.id, { textAlign: "right" } as any)}>⟹</button>
                            {/* Background color */}
                            <input
                              type="color"
                              value={(g as any).bgColor ?? "#00000000" /* browsers don’t support alpha here; use a hex or treat empty as transparent */}
                              onChange={(e) => updateGraphic(g.id, { bgColor: e.target.value } as any)}
                              className="w-6 h-6 rounded border"
                              title="Background color"
                            />
                            {/* Corner radius (px) */}
                            <input
                              type="number"
                              min={0}
                              max={120}
                              value={Math.round((g as any).radius ?? 0)}
                              onChange={(e) => updateGraphic(g.id, { radius: Number(e.target.value) } as any)}
                              className="w-16 h-6 text-xs bg-background border rounded px-1"
                              title="Corner radius (px)"
                            />
                          </div>
                        )}
                      </>
                      ) : gThumb ? (
                        <img src={gThumb} alt={g.name || "Graphic"} className="max-w-full max-h-full object-contain rounded" />
                      ) : (
                        <span className="text-4xl">{g.icon}</span>
                      )}
                    </div>

                    {controlsVisible && editingGraphicId !== g.id && (["nw","ne","sw","se"] as Handle[]).map((h) => {
                      const pos =
                        h === "nw" ? "top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nw-resize" :
                        h === "ne" ? "top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-ne-resize" :
                        h === "sw" ? "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-sw-resize" :
                                     "bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-se-resize";
                      return (
                        <div
                          key={h}
                          className={`aa-handle absolute w-3 h-3 bg-yellow-400 rounded-sm border border-yellow-600 ${pos}`}
                          style={{ pointerEvents: "auto" }}
                          onPointerDown={(e) => beginResize(e, "graphic", g.id, h, g)}
                          onMouseDown={(e) => beginResize(e, "graphic", g.id, h, g)}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Empty state */}
            {activeClips.length === 0 && activeGraphics.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground pointer-events-none z-20">
                <div className="text-center">
                  <div className="text-4xl mb-2">🎬</div>
                  <div className="text-sm">No active clips at {currentTime.toFixed(2)}s</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
