// src/components/ProjectIOButtons.tsx
import React, { useRef, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTimelineStore } from "@/store/TimelineStore";
import {
  exportActionsToCSV,
  exportGraphicsToCSV,
  importActionsFromCSV,
  importGraphicsFromCSV,
  downloadCSV,
} from "@/lib/projectIO";
import { toast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import html2canvas from "html2canvas";
import type { BackgroundTrack, GraphicTimelineClip } from "@/types/storyboard";
import { fromImageArray } from "@/lib/whammy";

type BackgroundTrackLike = BackgroundTrack & Record<string, any>;

const BG_KINDS = new Set(["color", "gradient", "image"]);

const ensureNumber = (value: any, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const ensureString = (value: any, fallback = "") =>
  value == null ? fallback : String(value);

const cloneStops = (stops: any[]) =>
  Array.isArray(stops) ? stops.map((stop: any) => ({ ...stop })) : [];

const cloneMeta = (meta: any) => {
  if (!meta || typeof meta !== "object") return undefined;
  const out: any = { ...meta };
  if (Array.isArray(meta.stops)) out.stops = cloneStops(meta.stops);
  if (Array.isArray(meta.colors)) out.colors = [...meta.colors];
  if (Array.isArray(meta.gradientColors)) out.gradientColors = [
    ...meta.gradientColors,
  ];
  if (meta.src) out.src = ensureString(meta.src);
  if (meta.image) out.image = ensureString(meta.image);
  if (meta.url) out.url = ensureString(meta.url);
  if (meta.fileName) out.fileName = ensureString(meta.fileName);
  if (meta.filename) out.filename = ensureString(meta.filename);
  if (meta.originalFileName) out.originalFileName = ensureString(meta.originalFileName);
  if (meta.originalFilename) out.originalFilename = ensureString(meta.originalFilename);
  if (meta.transitionIn) out.transitionIn = { ...meta.transitionIn };
  if (meta.transitionOut) out.transitionOut = { ...meta.transitionOut };
  return out;
};

const backgroundKindFrom = (src: any): string => {
  if (!src || typeof src !== "object") return "";
  const candidates = [
    src.meta?.kind,
    src.meta?.type,
    src.kind,
    src.type,
    src.backgroundType,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const lower = candidate.toLowerCase();
    if (BG_KINDS.has(lower)) return lower;
  }
  return "";
};

const isBackgroundLikeEntry = (entry: any): boolean => {
  if (!entry || typeof entry !== "object") return false;
  if (entry.isBackground) return true;
  if (typeof entry.type === "string" && entry.type.toLowerCase() === "background") {
    return true;
  }
  return !!backgroundKindFrom(entry);
};

const normalizeBackgroundEntry = (
  source: any,
  parent: any,
  key: string
): BackgroundTrackLike => {
  const metaPrimary = cloneMeta(source?.meta);
  const metaSecondary = cloneMeta(parent?.meta);
  let meta: any = metaPrimary ?? metaSecondary;
  const inferredKind =
    backgroundKindFrom(source) ||
    backgroundKindFrom(metaPrimary) ||
    backgroundKindFrom(parent) ||
    backgroundKindFrom(metaSecondary);

  const start = ensureNumber(
    source?.startTime ?? source?.start ?? parent?.startTime ?? parent?.start,
    0
  );

  const endCandidate =
    source?.endTime ??
    source?.stopTime ??
    (Number.isFinite(source?.duration)
      ? start + ensureNumber(source.duration)
      : Number.isFinite(parent?.endTime)
      ? ensureNumber(parent.endTime)
      : Number.isFinite(parent?.duration)
      ? start + ensureNumber(parent.duration)
      : start);
  const end = ensureNumber(endCandidate, start);
  const rawDuration =
    Number.isFinite(source?.duration)
      ? Math.max(0, ensureNumber(source.duration))
      : Math.max(0, end - start);
  const safeDuration =
    rawDuration > 0
      ? rawDuration
      : Math.max(0.1, ensureNumber(parent?.duration, 0) || 0);
  const safeEnd = safeDuration > 0 ? start + safeDuration : end;

  const name = ensureString(source?.name ?? parent?.name, "Background");
  const parentId = ensureString(parent?.id);
  const candidateId = ensureString(source?.id);
  const id = candidateId || (parentId ? `${parentId}-${key}` : `bg-${key}`);

  const color = ensureString(
    source?.color ??
      source?.backgroundColor ??
      meta?.color ??
      meta?.backgroundColor ??
      parent?.color ??
      ""
  );

  const gradientDirection = ensureString(
    source?.gradientDirection ??
      meta?.gradientDirection ??
      meta?.direction ??
      parent?.gradientDirection ??
      ""
  );

  const gradientColors =
    Array.isArray(source?.gradientColors)
      ? [...source.gradientColors]
      : Array.isArray(meta?.colors)
      ? [...meta.colors]
      : Array.isArray(meta?.gradientColors)
      ? [...meta.gradientColors]
      : Array.isArray(parent?.gradientColors)
      ? [...parent.gradientColors]
      : Array.isArray(meta?.stops)
      ? meta.stops.map((stop: any) => ensureString(stop?.color)).filter(Boolean)
      : [];

  let imageUrl = ensureString(
    source?.imageUrl ??
      source?.src ??
      meta?.src ??
      meta?.image ??
      meta?.url ??
      parent?.imageUrl ??
      parent?.src ??
      parent?.url ??
      ""
  );
  if (imageUrl.startsWith("blob:")) {
    imageUrl = "";
  }

  const imageFit = ensureString(
    source?.imageFit ??
      meta?.imageFit ??
      parent?.imageFit ??
      ""
  );

  const gradientType = ensureString(
    meta?.type ??
      parent?.meta?.type ??
      source?.gradientType ??
      parent?.gradientType ??
      ""
  );

  const angleDeg =
    typeof meta?.angleDeg === "number"
      ? meta.angleDeg
      : typeof parent?.meta?.angleDeg === "number"
      ? parent.meta.angleDeg
      : undefined;

  let value = ensureString(
    source?.value ??
      meta?.value ??
      parent?.value ??
      (inferredKind === "image"
        ? imageUrl
        : inferredKind === "color"
        ? color
        : imageUrl || color)
  );
  if (value.startsWith("blob:")) {
    value = imageUrl || color || "";
  }

  let resolvedKind = inferredKind;
  const looksGradient =
    gradientColors.length > 1 ||
    /gradient/i.test(value) ||
    /gradient/i.test(gradientDirection);
  const looksColor =
    !!color ||
    /^#|^rgb|^hsl/i.test(value) ||
    /^var\(--/.test(value);
  if (!resolvedKind) {
    if (imageUrl) resolvedKind = "image";
    else if (looksGradient) resolvedKind = "gradient";
    else if (looksColor) resolvedKind = "color";
  }

  if (!meta) {
    if (resolvedKind === "image" || imageUrl) {
      meta = { kind: "image", src: imageUrl || value };
    } else if (resolvedKind === "gradient" || gradientColors.length) {
      meta = {
        kind: "gradient",
        type: (gradientType || "linear") as any,
        angleDeg,
        stops:
          gradientColors.length > 0
            ? gradientColors.map((stopColor, idx) => ({
                color: stopColor,
                offset: gradientColors.length > 1 ? idx / (gradientColors.length - 1) : 0,
              }))
            : Array.isArray(metaPrimary?.stops)
            ? cloneStops(metaPrimary.stops)
            : [],
      };
    } else if (resolvedKind === "color" || color) {
      meta = { kind: "color", color: color || value };
    }
  } else {
    if (!meta.kind && resolvedKind) meta.kind = resolvedKind;
    if (resolvedKind === "image" && imageUrl && !(meta as any).src) {
      (meta as any).src = imageUrl;
    }
    if (resolvedKind === "color" && color && !(meta as any).color) {
      (meta as any).color = color;
    }
    if (resolvedKind === "gradient") {
      if (!(meta as any).type && gradientType) (meta as any).type = gradientType as any;
      if (angleDeg != null && !(meta as any).angleDeg) (meta as any).angleDeg = angleDeg;
      if (!(meta as any).stops || !(meta as any).stops.length) {
        const stopsSource =
          Array.isArray(metaPrimary?.stops) && metaPrimary.stops.length
            ? cloneStops(metaPrimary.stops)
            : gradientColors.map((stopColor, idx) => ({
                color: stopColor,
                offset: gradientColors.length > 1 ? idx / (gradientColors.length - 1) : 0,
              }));
        (meta as any).stops = stopsSource;
      }
    }
  }

  if (resolvedKind === "image" && !imageUrl && meta?.src) {
    imageUrl = ensureString(meta.src);
  }

  if (resolvedKind === "image" && !value && imageUrl) {
    value = imageUrl;
  } else if (resolvedKind === "color" && !value && color) {
    value = color;
  }

  const transitionIn =
    meta?.transitionIn ??
    source?.transitionIn ??
    parent?.transitionIn ??
    parent?.meta?.transitionIn;
  const transitionOut =
    meta?.transitionOut ??
    source?.transitionOut ??
    parent?.transitionOut ??
    parent?.meta?.transitionOut;
  if (meta && (transitionIn || transitionOut)) {
    meta = { ...meta };
    if (transitionIn) meta.transitionIn = transitionIn;
    if (transitionOut) meta.transitionOut = transitionOut;
  }

  return {
    id,
    name,
    startTime: start,
    endTime: safeEnd,
    duration: safeDuration,
    type: ensureString(
      resolvedKind ||
        source?.type ||
        parent?.type ||
        (imageUrl ? "image" : gradientColors.length ? "gradient" : color ? "color" : "")
    ),
    value,
    color,
    gradientDirection,
    gradientColors,
    imageUrl,
    imageFit,
    ...(meta ? { meta } : {}),
  } as BackgroundTrackLike;
};

const deriveBackgroundTracksFromTracks = (tracks: any[]): BackgroundTrackLike[] => {
  const out: BackgroundTrackLike[] = [];
  (tracks ?? []).forEach((track, ti) => {
    if (!track || typeof track !== "object") return;
    if (!Array.isArray(track.clips) && isBackgroundLikeEntry(track)) {
      out.push(normalizeBackgroundEntry(track, track, `track-${ti}`));
      return;
    }
    if (Array.isArray(track.clips)) {
      track.clips.forEach((clip: any, ci: number) => {
        if (!isBackgroundLikeEntry(clip)) return;
        out.push(normalizeBackgroundEntry(clip, track, `track-${ti}-clip-${ci}`));
      });
    }
  });
  return out;
};

const stripBackgroundClipsFromTracks = (tracks: any[]): any[] => {
  const out: any[] = [];
  (tracks ?? []).forEach((track) => {
    if (!track || typeof track !== "object") return;
    if (!Array.isArray(track.clips)) {
      if (isBackgroundLikeEntry(track)) return;
      out.push({ ...track });
      return;
    }
    const filtered = track.clips.filter((clip: any) => !isBackgroundLikeEntry(clip));
    const cloned = filtered.map((clip: any) => ({ ...clip }));
    out.push({ ...track, clips: cloned });
  });
  return out;
};

const mergeBackgroundTrackLists = (
  base: BackgroundTrackLike[] | undefined,
  derived: BackgroundTrackLike[] | undefined
): BackgroundTrackLike[] => {
  const seen = new Map<string, BackgroundTrackLike>();
  const pushList = (list: BackgroundTrackLike[] | undefined, prefix: string) => {
    (list ?? []).forEach((item, idx) => {
      if (!item) return;
      const normalized = normalizeBackgroundEntry(item, item, `${prefix}-${idx}`);
      const key = ensureString(normalized.id, `${prefix}-${idx}`);
      if (!seen.has(key)) {
        seen.set(key, { ...normalized, id: key });
      }
    });
  };
  pushList(base as BackgroundTrackLike[], "base");
  pushList(derived as BackgroundTrackLike[], "derived");
  return Array.from(seen.values());
};

/* --------------------------- helpers --------------------------- */
function downloadJSON(filename: string, data: unknown) {
  const text = JSON.stringify(data, null, 2);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function readJSONFromFile(file: File) {
  const text = await file.text();
  return JSON.parse(text);
}

/** Draw the DOM stage to a canvas using html2canvas and keep live <canvas> content. */
async function drawElementToCanvas(el: HTMLElement, canvas: HTMLCanvasElement) {
  const rect = el.getBoundingClientRect();
  const width = Math.max(2, Math.round(rect.width));
  const height = Math.max(2, Math.round(rect.height));

  // Render at DPR=1 for metric parity first. You can set to devicePixelRatio later if you want.
  const SCALE = 1; 
  canvas.width = Math.max(2, Math.round(width * SCALE));
  canvas.height = Math.max(2, Math.round(height * SCALE));

  // Try the Tailwind fork path first
  const USE_TW_FORK = true; // flip to false to compare behavior

  try { if ((document as any).fonts?.ready) await (document as any).fonts.ready; } catch {}

  // Ensure images are loaded (best-effort)
  const imgs = Array.from(el.querySelectorAll("img")) as HTMLImageElement[];
  await Promise.all(
    imgs.map(img => img.complete && img.naturalWidth > 0
      ? undefined
      : new Promise<void>(res => {
          const done = () => { img.removeEventListener("load", done); img.removeEventListener("error", done); res(); };
          img.addEventListener("load", done);
          img.addEventListener("error", done);
        })
    )
  );

  const h2cCanvas = await html2canvas(el, {
    backgroundColor: null,
    useCORS: true,
    allowTaint: true,
    width,
    height,
    scale: SCALE,
    removeContainer: true,

    // The fork handles Tailwind + computed styles better via foreignObject;
    // start with true. If you hit a CORS warning for images/video, flip it to false.
    foreignObjectRendering: false, //USE_TW_FORK ? true : false,

    onclone: (doc) => {
      // Keep the stage size identical in the clone.
      try { doc?.body?.setAttribute("data-exporting", "true"); } catch {}
      const clonedEl = doc.body.querySelector("#preview-stage") as HTMLElement | null;
      if (clonedEl) {
        clonedEl.style.width = `${width}px`;
        clonedEl.style.height = `${height}px`;
        clonedEl.style.overflow = "hidden";
      }

      // Enforce the same baseline Tailwind-ish defaults in the clone
      try {
        const style = doc.createElement("style");
        style.id = "__h2c_text_lock";
        style.textContent = `
          html, body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
          [data-editable="true"] { white-space: pre-wrap !important; }
          #preview-stage img { display: inline-block !important; vertical-align: baseline !important; }
        `;
        doc.head.appendChild(style);
      } catch {}

      // IMPORTANT: when we rely on the fork + foreignObjectRendering,
      // do NOT apply any translateY or line-height hacks. We want the
      // browser to paint the same layout as the live DOM.
      if (!USE_TW_FORK) {
        // (fallback to your previous canvas-path metric locking if you want)
        // …you can paste your old “copy canvas bitmaps + hard-lock text metrics” here if needed.
      }
    },
  });

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(h2cCanvas, 0, 0, canvas.width, canvas.height);
}


function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Attempt to get audio from the app or any <audio> element. */
async function tryGetAudioStream(): Promise<MediaStream | null> {
  try {
    const getStream = (window as any).__aaGetAudioStream;
    if (typeof getStream === "function") {
      const s = await getStream();
      if (s && s.getAudioTracks().length) return s;
    }
    const getAC = (window as any).__aaGetAudioContext;
    const getMaster = (window as any).__aaGetMasterNode;
    if (typeof getAC === "function" && typeof getMaster === "function") {
      const ac: AudioContext = getAC();
      const master: AudioNode = getMaster();
      if (ac && master && "createMediaStreamDestination" in ac) {
        const dest = ac.createMediaStreamDestination();
        try {
          master.connect(dest);
          return dest.stream;
        } catch {}
      }
    }
    const audioEl = document.querySelector("audio") as HTMLAudioElement | null;
    if (audioEl && typeof (audioEl as any).captureStream === "function") {
      const s: MediaStream = (audioEl as any).captureStream();
      if (s && s.getAudioTracks().length) return s;
    }
  } catch {}
  return null;
}

/* ---------------------- duration computation ---------------------- */
function _maxEndFromArray(arr: any[] = []) {
  let max = 0;
  for (const c of arr) {
    const st =
      typeof c.startTime === "number" ? c.startTime :
      typeof c.start === "number" ? c.start : 0;
    const en =
      typeof c.endTime === "number" ? c.endTime :
      typeof c.duration === "number" ? st + c.duration : st;
    if (en > max) max = en;
  }
  return max;
}

function computeTimelineDurationSec({
  tracks,
  audioTracks,
  backgroundTracks,
  graphics,
}: {
  tracks: any[];
  audioTracks: any[];
  backgroundTracks: any[];
  graphics?: GraphicTimelineClip[];
}) {
  const fromTracks = Math.max(0, ...(tracks || []).map((t: any) => _maxEndFromArray(t?.clips || [])));
  const fromAudio = _maxEndFromArray(audioTracks);
  const fromBg = _maxEndFromArray((backgroundTracks || []).flatMap((b: any) => (b?.clips ? b.clips : [b])));
  const fromGraphics = _maxEndFromArray(graphics);
  const duration = Math.max(fromTracks, fromAudio, fromBg, fromGraphics, 0.5);
  console.table({
    "duration.fromTracks": fromTracks,
    "duration.fromAudio": fromAudio,
    "duration.fromBackgrounds": fromBg,
    "duration.fromGraphics": fromGraphics,
    "duration.final": duration,
  });
  return duration;
}

/* ============================== component ============================== */
export const ProjectIOButtons: React.FC = () => {
  const {
    // state
    tracks,
    audioTracks,
    backgroundTracks,
    graphics,
    currentTime,
    isPlaying,
    customThumbnails,

    // setters
    setTracks,
    setAudioTracks,
    setBackgroundTracks,
    setGraphics,
    setCurrentTime,
    setIsPlaying,
    setThumbnails,
  } = useTimelineStore() as any;

  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportKind, setExportKind] = useState<"json" | "actions" | "graphics" | "video">("json");
  const [importKind, setImportKind] = useState<"json" | "actions" | "graphics">("json");

  const jsonImportRef = useRef<HTMLInputElement | null>(null);
  const csvImportRef = useRef<HTMLInputElement | null>(null);

  /* ----------------------- JSON / CSV actions ----------------------- */
  const handleExportProjectJSON = () => {
    try {
      const derivedBackgrounds = deriveBackgroundTracksFromTracks(tracks ?? []);
      const mergedBackgrounds = mergeBackgroundTrackLists(
        Array.isArray(backgroundTracks) ? backgroundTracks : [],
        derivedBackgrounds
      );
      const sanitizedTracks = stripBackgroundClipsFromTracks(tracks ?? []);

      const snapshot = {
        tracks: sanitizedTracks,
        audioTracks: audioTracks ?? [],
        backgroundTracks: mergedBackgrounds,
        graphics: Array.isArray(graphics) ? graphics : [],
        currentTime: typeof currentTime === "number" ? currentTime : 0,
        isPlaying: !!isPlaying,
        customThumbnails: customThumbnails ?? {},
      };
      downloadJSON("anim-arrange-project.json", snapshot);
      toast({ title: "Exported", description: "Project saved as JSON." });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message ?? String(e) });
    }
  };

  const handleImportProjectJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const json = await readJSONFromFile(f);
      const importedTracks = Array.isArray(json?.tracks) ? json.tracks : [];
      const derivedBackgrounds = deriveBackgroundTracksFromTracks(importedTracks);
      const mergedBackgrounds = mergeBackgroundTrackLists(
        Array.isArray(json?.backgroundTracks) ? json.backgroundTracks : [],
        derivedBackgrounds
      );
      const sanitizedTracks = stripBackgroundClipsFromTracks(importedTracks);

      if (typeof setTracks === "function") setTracks(sanitizedTracks);
      if (json?.audioTracks && typeof setAudioTracks === "function") setAudioTracks(json.audioTracks);
      if (typeof setBackgroundTracks === "function") setBackgroundTracks(mergedBackgrounds);
      if (Array.isArray(json?.graphics) && typeof setGraphics === "function") setGraphics(json.graphics);
      if (typeof json?.currentTime === "number" && typeof setCurrentTime === "function") setCurrentTime(json.currentTime);
      if (typeof json?.isPlaying === "boolean" && typeof setIsPlaying === "function") setIsPlaying(json.isPlaying);
      if (json?.customThumbnails && typeof setThumbnails === "function") setThumbnails(json.customThumbnails);
      toast({ title: "Imported", description: "Project loaded from JSON." });
      setImportOpen(false);
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.message ?? String(err) });
    } finally {
      e.target.value = "";
    }
  };

  const FPS = 24;
  const defaultCharacterSet = "Strider";

  const handleExportActionsCSV = () => {
    try {
      const csv = exportActionsToCSV(tracks ?? [], FPS, defaultCharacterSet);
      downloadCSV("actions.csv", csv);
      toast({ title: "Exported", description: "Actions exported to CSV." });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message ?? String(e) });
    }
  };

const handleExportGraphicsCSV = () => {
  try {
    const isActionClip = (c: any) => typeof c?.animationId === "string";

    // 1) Derive GRAPHIC-ONLY tracks
    const baseSanitizedTracks = stripBackgroundClipsFromTracks(tracks ?? []);
    const graphicTracksInput = baseSanitizedTracks
      .map((trackLike: any) => {
        if (!Array.isArray(trackLike?.clips)) return null;
        const clips = trackLike.clips
          .filter((clip: any) => !isActionClip(clip))
          .map((clip: any) => ({ ...clip }));
        if (!clips.length) return null;
        return { ...trackLike, clips };
      })
      .filter(Boolean);

    // 2) Derive BACKGROUND “tracks” from:
    //    a) dedicated backgroundTracks state (if you keep one)
    //    b) any background-like clips found inside normal tracks
    const backgroundTracksFromState = Array.isArray(backgroundTracks) ? backgroundTracks : [];
    const derivedFromTracks = deriveBackgroundTracksFromTracks(tracks ?? []);
    const backgroundTracksInput = mergeBackgroundTrackLists(
      backgroundTracksFromState,
      derivedFromTracks
    );

    // quick sanity log
    console.table({
      totalTracks: (tracks ?? []).length,
      graphicTracksUsed: graphicTracksInput.length,
      totalGraphicClips: graphicTracksInput.reduce((s: number, t: any) => s + (t?.clips?.length ?? 0), 0),
      backgroundTracksFromState: backgroundTracksFromState.length,
      derivedBackgroundEntries: derivedFromTracks.length,
      mergedBackgroundEntries: backgroundTracksInput.length,
    });

    // 3) Export
    const csv = exportGraphicsToCSV({
      graphicTracks: graphicTracksInput,
      backgroundTracks: backgroundTracksInput,
      fps: FPS,
      graphicThumbnails: customThumbnails ?? {},
    });

    downloadCSV("graphics.csv", csv);
    toast({ title: "Exported", description: "Graphics + Backgrounds exported to CSV." });
  } catch (e: any) {
    toast({ title: "Export failed", description: e?.message ?? String(e) });
  }
};

  const readFileText = (f: File) => f.text();

  const handleImportActionsCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const csvText = await readFileText(f);
      const importedTrack = importActionsFromCSV(csvText, FPS, defaultCharacterSet);
      if (typeof setTracks === "function") setTracks([...(tracks ?? []), importedTrack]);
      toast({ title: "Imported", description: "Actions CSV imported into a new track." });
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.message ?? String(err) });
    } finally {
      e.target.value = "";
    }
  };

  const handleImportGraphicsCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const csvText = await readFileText(f);
      const importedTrack = importGraphicsFromCSV(csvText, FPS);
      if (typeof setTracks === "function") setTracks([...(tracks ?? []), importedTrack]);
      toast({ title: "Imported", description: "Graphics CSV imported into a new track." });
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.message ?? String(err) });
    } finally {
      e.target.value = "";
    }
  };

  /* ------------------ VIDEO export (guarded stop/requestData) ------------------ */
  async function handleExportVideoWebM() {
    const cancelRef = { current: false };
    const FPS_LOCAL = FPS;
    const FRAME_DURATION = 1 / FPS_LOCAL;
    const wasPlaying = !!isPlaying;
    const originalTime =
      typeof currentTime === "number" && Number.isFinite(currentTime) ? currentTime : 0;

    let stage: HTMLElement | null = null;
    let prevStageStyle:
      | {
          width?: string;
          height?: string;
          transform?: string;
          contain?: string;
          willChange?: string;
        }
      | null = null;
    let canvas: HTMLCanvasElement | null = null;

    const updateToast = (pct: number, note?: string) => {
      toast({
        title: "Exporting video…",
        description: `${Math.min(100, Math.floor(pct))}%${note ? ` • ${note}` : ""}`,
        action: (
          <Button variant="destructive" onClick={() => { cancelRef.current = true; }}>
            Cancel
          </Button>
        ),
      });
    };

    const sleepUntil = (targetMs: number) =>
      new Promise<void>((r) => setTimeout(r, Math.max(0, targetMs - performance.now())));

    try {
      stage = document.getElementById("preview-stage") as HTMLElement | null;
      if (!stage) {
        toast({ title: "Preview not found", description: "Element id='preview-stage' not found." });
        return;
      }

      setIsPlaying?.(false);

      // 1) Authoritative duration
      const durationSec = computeTimelineDurationSec({
        tracks: tracks ?? [],
        audioTracks: audioTracks ?? [],
        backgroundTracks: backgroundTracks ?? [],
        graphics: graphics ?? [],
      });
      const totalFrames = Math.max(1, Math.floor(durationSec * FPS_LOCAL) + 1);

      // 2) settle a paint
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await Promise.resolve();

      // 3) fix stage size
      const rect = stage.getBoundingClientRect();
      const W = Math.max(2, Math.round(rect.width)) & ~1;
      const H = Math.max(2, Math.round(rect.height)) & ~1;
      if (W < 2 || H < 2) {
        toast({ title: "Stage too small", description: "Preview size is 0×0." });
        return;
      }

      prevStageStyle = {
        width: stage.style.width,
        height: stage.style.height,
        transform: stage.style.transform,
        contain: stage.style.contain,
        willChange: stage.style.willChange,
      };
      stage.style.width = `${W}px`;
      stage.style.height = `${H}px`;
      stage.style.transform = "translateZ(0)";
      stage.style.contain = "layout paint size";
      stage.style.willChange = "auto";

      // 4) offscreen canvas + stream
      canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      canvas.style.position = "fixed";
      canvas.style.left = "-99999px";
      canvas.style.top = "0";
      canvas.style.pointerEvents = "none";
      document.body.appendChild(canvas);

      const frames: string[] = [];
      updateToast(0, `${FPS_LOCAL} fps`);

      const exportStart = performance.now();

      for (let frame = 0; frame < totalFrames; frame++) {
        if (cancelRef.current) break;

        const targetTime = exportStart + frame * FRAME_DURATION * 1000;
        await sleepUntil(targetTime);

        const logicalT = Math.min(durationSec, frame * FRAME_DURATION);
        setCurrentTime?.(logicalT);

        await new Promise((r) => requestAnimationFrame(() => r(null)));
        await Promise.resolve();

        try {
          await drawElementToCanvas(stage, canvas);
        } catch {
          const ctx = canvas.getContext("2d");
          if (ctx) { ctx.fillStyle = "black"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        }

        frames.push(canvas.toDataURL("image/webp", 0.95));
        const pct = ((frame + 1) / totalFrames) * 100;
        if (Number.isFinite(pct) && pct >= 0) updateToast(Math.max(0, Math.min(100, pct)));
      }

      if (cancelRef.current) {
        toast({ title: "Export cancelled", description: "Video export cancelled by user." });
        return;
      }

      const blob = await fromImageArray(frames, FPS_LOCAL, W, H);
      if (!blob || blob.size < 256) {
        toast({
          title: "Video export failed",
          description: "Generated video blob is empty.",
        });
        return;
      }

      downloadBlob("preview.webm", blob);
      toast({
        title: "Exported",
        description: `Saved preview as WebM (${FPS_LOCAL}fps).`,
      });

    } catch (e: any) {
      console.error(e);
      toast({ title: "Video export failed", description: e?.message ?? "Unexpected error during recording." });
    } finally {
      if (canvas?.parentNode) {
        try { canvas.remove(); } catch { canvas.parentNode?.removeChild(canvas); }
      }
      if (stage && prevStageStyle) {
        stage.style.width = prevStageStyle.width ?? "";
        stage.style.height = prevStageStyle.height ?? "";
        stage.style.transform = prevStageStyle.transform ?? "";
        stage.style.contain = prevStageStyle.contain ?? "";
        stage.style.willChange = prevStageStyle.willChange ?? "";
      }
      setCurrentTime?.(originalTime);
      setIsPlaying?.(wasPlaying);
      try { document.getElementById("__aa_export_css")?.remove(); } catch {}
      try { (document.activeElement as HTMLElement | null)?.blur(); } catch {}

    }
  }

  const handleDoExport = () => {
    switch (exportKind) {
      case "json":
        handleExportProjectJSON();
        break;
      case "actions":
        handleExportActionsCSV();
        break;
      case "graphics":
        handleExportGraphicsCSV();
        break;
      case "video":
        handleExportVideoWebM();
        break;
    }
    setExportOpen(false);
  };

  const triggerImport = () => {
    if (importKind === "json") jsonImportRef.current?.click();
    else csvImportRef.current?.click();
  };

  const handleCSVImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const csvText = await readFileText(f);
      if (importKind === "actions") {
        const importedTrack = importActionsFromCSV(csvText, FPS, defaultCharacterSet);
        if (typeof setTracks === "function") setTracks([...(tracks ?? []), importedTrack]);
        toast({ title: "Imported", description: "Actions CSV imported into a new track." });
      } else if (importKind === "graphics") {
        const importedTrack = importGraphicsFromCSV(csvText, FPS);
        if (typeof setTracks === "function") setTracks([...(tracks ?? []), importedTrack]);
        toast({ title: "Imported", description: "Graphics CSV imported into a new track." });
      }
      setImportOpen(false);
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.message ?? String(err) });
    } finally {
      e.target.value = "";
    }
  };

  const csvAccept = useMemo(() => ".csv,text/csv", []);

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Export */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogTrigger asChild>
          <Button>Export…</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Export</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <RadioGroup value={exportKind} onValueChange={(v) => setExportKind(v as any)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="json" id="exp-json" />
                <Label htmlFor="exp-json">Project JSON</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="actions" id="exp-actions" />
                <Label htmlFor="exp-actions">Actions CSV</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="graphics" id="exp-graphics" />
                <Label htmlFor="exp-graphics">Graphics CSV</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="video" id="exp-video" />
                <Label htmlFor="exp-video">Video (WebM, beta)</Label>
              </div>
            </RadioGroup>
            <Separator />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setExportOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleDoExport}>Export</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary">Import…</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Import</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <RadioGroup value={importKind} onValueChange={(v) => setImportKind(v as any)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="json" id="imp-json" />
                <Label htmlFor="imp-json">Project JSON</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="actions" id="imp-actions" />
                <Label htmlFor="imp-actions">Actions CSV</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="graphics" id="imp-graphics" />
                <Label htmlFor="imp-graphics">Graphics CSV</Label>
              </div>
            </RadioGroup>
            <Separator />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
              <Button onClick={triggerImport}>Choose File…</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden inputs */}
      <input
        ref={jsonImportRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleImportProjectJSON}
      />
      <input
        ref={csvImportRef}
        type="file"
        accept={csvAccept}
        className="hidden"
        onChange={handleCSVImportChange}
      />
    </div>
  );
};
