// src/lib/projectIO.ts
// CSV + JSON import/export utilities.
// Export graphics + backgrounds with transition metadata.
// Backward compatible with your previous API.

import type {
  Track,
  TimelineClip,
  GraphicTimelineClip,
  BackgroundTrack,
  BackgroundMeta,
  BackgroundGradientMeta,
  BackgroundColorMeta,
  BackgroundImageMeta,
  TransitionSpec,
} from "@/types/storyboard";

/* ----------------------------- Shared helpers ----------------------------- */

const n = (v: any, fb = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fb;

const s = (v: any): string => (v == null ? "" : String(v));

const startOf = (c: { startTime?: number; start?: number }) =>
  n(c?.startTime ?? c?.start, 0);

const durationOf = (c: { duration?: number; endTime?: number; startTime?: number; start?: number }) => {
  if (Number.isFinite(c?.duration)) return n(c.duration);
  if (Number.isFinite(c?.endTime)) return Math.max(0, n(c.endTime) - startOf(c));
  return 0;
};

const endOf = (c: { endTime?: number; duration?: number; startTime?: number; start?: number }) =>
  Number.isFinite(c?.endTime) ? n(c.endTime) : startOf(c) + durationOf(c);

/** Escape for CSV cell */
function csvEscape(v: string): string {
  if (v == null) return "";
  const str = String(v);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/* Resolve per-clip "character set" label with fallbacks */
function resolveCharacterSet(clip: any, fallback: string): string {
  const metaCS =
    clip && clip.meta && typeof clip.meta.characterSet === "string"
      ? clip.meta.characterSet
      : undefined;
  const directCS = typeof clip?.characterSet === "string" ? clip.characterSet : undefined;
  const fromSource =
    (typeof clip?.sourceSetName === "string" && clip.sourceSetName) ||
    (typeof clip?.sourceSetId === "string" && clip.sourceSetId) ||
    undefined;
  return metaCS || directCS || fromSource || fallback;
}

/* ----------------------------- CSV parsing ----------------------------- */

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const src = String(text ?? "").replace(/^\uFEFF/, ""); // strip BOM
  const lines = src.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let i = 0;
    let inQuotes = false;
    while (i < line.length) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        cur += ch;
        i++;
        continue;
      } else {
        if (ch === '"') {
          inQuotes = true;
          i++;
          continue;
        }
        if (ch === ",") {
          out.push(cur);
          cur = "";
          i++;
          continue;
        }
        cur += ch;
        i++;
        continue;
      }
    }
    out.push(cur);
    return out.map((v) => v.trim());
  };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

/** Download a CSV string as a file (normalize line endings for Excel) */
export function downloadCSV(filename: string, csv: string) {
  const normalized = csv.replace(/\r?\n/g, "\r\n");
  const blob = new Blob([normalized], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ----------------------------- Actions CSV ----------------------------- */

/**
 * Export animation clips to CSV.
 * Columns: character_set, action_name, start_frame, end_frame
 */
export function exportActionsToCSV(
  tracks: Track[],
  fps: number,
  defaultCharacterSet: string
): string {
  const rows: string[] = [];
  rows.push(["character_set", "action_name", "start_frame", "end_frame"].join(","));

  for (const t of tracks) {
    for (const c of (t as any).clips || []) {
      if ("animationId" in (c as any)) {
        const st = startOf(c as any);
        const en = endOf(c as any);
        const startFrame = Math.round(st * fps);
        const endFrame = Math.round(en * fps);
        const actionName = (c as any).animationId || (c as any).name || "";
        const characterSet = resolveCharacterSet(c, defaultCharacterSet);
        rows.push(
          [characterSet, actionName, String(startFrame), String(endFrame)]
            .map(csvEscape)
            .join(",")
        );
      }
    }
  }
  return rows.join("\n");
}

/* --------------------- Graphics + Backgrounds CSV ---------------------- */

type ExportGraphicsArgs = {
  graphicTracks: any[];                 // tracks containing ONLY non-background clips
  backgroundTracks?: any[];             // tracks (or single-meta) for backgrounds
  fps?: number;
  graphicThumbnails?: Record<string, string>;
};

const num = (v: any): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: any): string => (v == null ? "" : String(v));
const secToFrames = (sec: number | undefined, fps: number): number =>
  Math.round((typeof sec === "number" ? sec : 0) * fps);

function serializeTransition(t?: any) {
  if (!t) return { type: "", duration: "", ease: "" };
  return {
    type: str(t.type),
    duration: String(num(t.duration)), // ms
    ease: str(t.ease ?? ""),
  };
}

function serializeBackgroundMeta(source?: any) {
  const empty = {
    kind: "",
    color: "",
    gradientType: "",
    gradientAngleDeg: "",
    gradientDirection: "",
    gradientStops: "",
    gradientColors: "",
    imageSrc: "",
    imageFit: "",
    value: "",
  };

  if (!source) return empty;

  const meta = source?.meta ?? {};
  const pick = (...values: any[]) => {
    for (const v of values) {
      if (v == null) continue;
      if (typeof v === "string" && v.trim() !== "") return v;
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    return undefined;
  };

  const kindRaw = pick(
    meta.kind,
    meta.type,
    source.kind,
    source.type,
    source.backgroundType,
    meta.backgroundType
  );
  const kind =
    typeof kindRaw === "string"
      ? (["color", "gradient", "image"].includes(kindRaw.toLowerCase())
          ? kindRaw.toLowerCase()
          : "")
      : "";

  const color = str(
    pick(
      source.color,
      source.backgroundColor,
      meta.color,
      meta.backgroundColor,
      kind === "color" ? source.value : undefined
    ) ?? ""
  );

  const gradientType =
    kind === "gradient"
      ? str(
          pick(
            meta.gradientType,
            meta.type,
            source.gradientType,
            (source.value || "").trim().startsWith("radial-")
              ? "radial"
              : (source.value || "").trim().startsWith("radial")
              ? "radial"
              : meta.kind === "gradient" && meta.type === undefined
              ? ""
              : "linear"
          ) ?? ""
        )
      : "";

  const gradientDirection = str(
    pick(
      meta.direction,
      meta.gradientDirection,
      meta.angle,
      source.gradientDirection,
      source.direction
    ) ?? ""
  );

  const gradientAngleDeg = (() => {
    if (Number.isFinite(meta.angleDeg)) return String(meta.angleDeg);
    if (/(-?\d+(?:\.\d+)?)deg/.test(gradientDirection)) {
      return RegExp.$1;
    }
    return "";
  })();

  const gradientStops = (() => {
    if (Array.isArray(meta.stops)) {
      return meta.stops
        .map((stop: any) => {
          const pct =
            typeof stop?.offset === "number"
              ? `${(stop.offset * 100).toFixed(1)}%`
              : "";
          const col = stop?.color ?? "";
          return [pct, col].filter(Boolean).join(" ").trim();
        })
        .filter(Boolean)
        .join(" | ");
    }
    if (Array.isArray(source.gradientStops)) {
      return source.gradientStops.join(" | ");
    }
    if (Array.isArray(source.gradientColors)) {
      return source.gradientColors.join(" | ");
    }
    if (Array.isArray(meta.colors)) {
      return meta.colors.join(" | ");
    }
    return "";
  })();

  const gradientColors = (() => {
    if (Array.isArray(source.gradientColors)) return source.gradientColors.join(" | ");
    if (Array.isArray(meta.colors)) return meta.colors.join(" | ");
    if (Array.isArray(meta.stops))
      return meta.stops.map((stop: any) => stop?.color ?? "").filter(Boolean).join(" | ");
    return "";
  })();

  const imageSrc = str(
    (
      kind === "image"
        ? pick(source.imageUrl, source.src, source.image, meta.src, meta.image, meta.url, source.value)
        : pick(source.imageUrl, source.src, source.image, meta.src, meta.image, meta.url)
    ) ?? ""
  );
  const imageFit = str(pick(source.imageFit, source.fit, meta.imageFit) ?? "");
  const value = str(pick(source.value, meta.value) ?? "");

  return {
    ...empty,
    kind,
    color,
    gradientType,
    gradientAngleDeg,
    gradientDirection,
    gradientStops,
    gradientColors,
    imageSrc,
    imageFit,
    value,
  };
}

const EXPORT_STAGE_WIDTH = 1920;
const EXPORT_STAGE_HEIGHT = 1080;

const toPixelCoordinate = (value: any, total: number): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  if (value <= 1) return String(Math.round(value * total));
  return String(Math.round(value));
};

const FILENAME_KEYS = [
  "fileName",
  "filename",
  "sourceFileName",
  "sourceFilename",
  "originalFileName",
  "originalFilename",
  "assetFileName",
  "assetFilename",
] as const;

const DATA_URI_REGEX = /^data:([^;,]+)[;,]/i;
const isDataUri = (value: string) => DATA_URI_REGEX.test(value);
const isBlobUri = (value: string) => /^blob:/i.test(value);
const isRemoteUrl = (value: string) =>
  /^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^file:/i.test(value);

function basenameFromPath(input: string): string {
  if (!input) return "";
  let working = input.trim();
  if (!working) return "";
  working = working.replace(/^file:\/+/, "");
  working = working.replace(/[?#].*$/, "");
  working = working.replace(/\\/g, "/");
  if (!working.includes("/")) return working;
  const parts = working.split("/");
  return parts.pop() || working;
}

function resolveFilenameFromSource(source: any, seen = new Set<any>()): string | undefined {
  if (!source || typeof source !== "object") return undefined;
  if (seen.has(source)) return undefined;
  seen.add(source);

  for (const key of FILENAME_KEYS) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  if (source.meta && typeof source.meta === "object") {
    const fromMeta = resolveFilenameFromSource(source.meta, seen);
    if (fromMeta) return fromMeta;
  }
  if (source.source && typeof source.source === "object") {
    const fromNested = resolveFilenameFromSource(source.source, seen);
    if (fromNested) return fromNested;
  }
  return undefined;
}

function inferExtensionFromMime(mime?: string): string {
  if (!mime) return "";
  const lower = mime.toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
  if (lower.includes("gif")) return "gif";
  if (lower.includes("svg")) return "svg";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("bmp")) return "bmp";
  if (lower.includes("tiff")) return "tiff";
  if (lower.includes("ico")) return "ico";
  return "";
}

function sanitizeBasename(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return trimmed
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
}

function guessFilenameFromContext(source: any, fallback?: string): string {
  const candidates = [
    source?.name,
    source?.title,
    source?.graphicId,
    source?.id,
    fallback,
  ];
  for (const candRaw of candidates) {
    if (typeof candRaw !== "string") continue;
    const cand = sanitizeBasename(candRaw);
    if (cand) return cand;
  }
  return "";
}

function sanitizeFileLikeValue(raw: string, source: any, fallbackName?: string): string {
  const fromSource = resolveFilenameFromSource(source);
  const preferred = fromSource ? basenameFromPath(fromSource) : undefined;
  const value = typeof raw === "string" ? raw.trim() : "";

  if (preferred) return preferred;
  if (!value) return "";
  if (isRemoteUrl(value)) return value;
  if (isBlobUri(value)) return "";
  if (isDataUri(value)) {
    const match = value.match(DATA_URI_REGEX);
    const ext = inferExtensionFromMime(match?.[1]);
    const baseFromContext = guessFilenameFromContext(source, fallbackName);
    if (baseFromContext && ext) {
      if (baseFromContext.toLowerCase().endsWith(`.${ext}`)) return baseFromContext;
      return `${baseFromContext}.${ext}`;
    }
    if (baseFromContext) return baseFromContext;
    if (ext) return `image.${ext}`;
    return "";
  }
  return basenameFromPath(value);
}

function toUnicodePoints(raw: string): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  const codes = Array.from(raw)
    .map((char) => {
      const cp = char.codePointAt(0);
      return cp != null ? `U+${cp.toString(16).toUpperCase().padStart(4, "0")}` : "";
    })
    .filter(Boolean);
  return codes.join(" ");
}

function sanitizeDisplayLabel(raw: string, source: any): string {
  const fromSource = resolveFilenameFromSource(source);
  const preferred = fromSource ? basenameFromPath(fromSource) : undefined;
  const value = typeof raw === "string" ? raw.trim() : "";

  if (preferred) return preferred;
  if (!value) return value;
  if (isRemoteUrl(value) || isDataUri(value) || isBlobUri(value)) return value;
  if (/^[a-z]:\\/.test(value) || /^file:/i.test(value) || /[\\/]/.test(value)) {
    const base = basenameFromPath(value);
    return base || value;
  }
  return value;
}

export function exportGraphicsToCSV(
  { graphicTracks, backgroundTracks = [], fps = 24, graphicThumbnails = {} }: ExportGraphicsArgs
): string {
  const headers = [
    // common
    "rowType",           // "graphic" | "background"
    "trackId",
    "clipId",
    "name",
    "clipType",          // graphics: text/image/shape; backgrounds: color/gradient/image
    "startTime",
    "endTime",
    "duration",

    // geometry (graphics only)
    "x", "y", "width", "height",
    "text", "textColor", "bgColor", "radius", "color", "imageSrc", "emojiUnicode",

    // transitions (both)
    "transitionIn.type",
    "transitionIn.durationMs",
    "transitionIn.ease",
    "transitionOut.type",
    "transitionOut.durationMs",
    "transitionOut.ease",

    // background-only fields
    "bg.kind",
    "bg.color",
    "bg.gradient.type",
    "bg.gradient.angleDeg",
    "bg.gradient.stops",
    "bg.image.src",
    "bg.gradient.direction",
    "bg.gradient.colors",
    "bg.image.fit",
    "bg.value",
  ];

  const rows: string[][] = [];
  const GRAPHIC_TYPES = new Set(["text", "shape", "icon", "image", "graphic", "sticker", "label"]);
  const isGraphicClip = (clip: any) => {
    if (!clip || typeof clip !== "object") return false;
    if (typeof clip.animationId === "string") return false;
    if (typeof clip.graphicId === "string") return true;
    const type = typeof clip.type === "string" ? clip.type.toLowerCase() : "";
    if (GRAPHIC_TYPES.has(type)) return true;
    if (typeof clip.content === "string" || typeof clip.text === "string") return true;
    return false;
  };

  // ---- GRAPHICS (never write background meta here) ----
  for (const gTrack of graphicTracks || []) {
    const clips = (gTrack?.clips ?? []).filter(isGraphicClip);
    for (const c of clips) {
      const start = num(c.startTime);
      const end = Number.isFinite(c.endTime) ? Number(c.endTime) : start + num(c.duration);
      const dur = Math.max(0, end - start);

      // convert JUST these three to frames:
      const startFrame = secToFrames(start, fps);
      const endFrame   = secToFrames(end, fps);
      const durFrame   = Math.max(0, endFrame - startFrame);

      const clipName = sanitizeDisplayLabel(str(c.name ?? c.graphicId ?? ""), c);
      const rawGraphicSrc =
        typeof c?.imageUrl === "string" ? c.imageUrl
        : typeof c?.src === "string" ? c.src
        : typeof c?.url === "string" ? c.url
        : typeof c?.value === "string" ? c.value
        : typeof c?.meta?.src === "string" ? c.meta.src
        : typeof c?.meta?.image === "string" ? c.meta.image
        : "";
      const thumbnailCandidates: string[] = [];
      if (c?.graphicId) {
        thumbnailCandidates.push(graphicThumbnails[c.graphicId]);
        thumbnailCandidates.push(graphicThumbnails[String(c.graphicId).replace(/-\d+$/, "")]);
      }
      thumbnailCandidates.push(graphicThumbnails[c?.id]);
      const thumbnailMatch = thumbnailCandidates.find((src) => typeof src === "string" && src.trim());
      const graphicImageSrc = sanitizeFileLikeValue(
        rawGraphicSrc || thumbnailMatch || "",
        c,
        clipName
      );
      const emojiUnicode = toUnicodePoints(str(c.icon ?? ""));

      const tin = serializeTransition(c.transitionIn);
      const tout = serializeTransition(c.transitionOut);

      rows.push([
        "graphic",
        str(gTrack.id),
        str(c.id),
        clipName,
        str(c.type ?? ""),
        String(startFrame),
        String(endFrame),
        String(durFrame),

        // geometry / visuals
        toPixelCoordinate(c.x, EXPORT_STAGE_WIDTH),
        toPixelCoordinate(c.y, EXPORT_STAGE_HEIGHT),
        toPixelCoordinate(c.width, EXPORT_STAGE_WIDTH),
        toPixelCoordinate(c.height, EXPORT_STAGE_HEIGHT),
        str(c.content ?? ""),      // text content
        str(c.textColor ?? ""),
        str(c.bgColor ?? ""),
        String(c.radius ?? ""),
        str(c.color ?? ""),
        graphicImageSrc,
        emojiUnicode,

        // transitions
        tin.type, tin.duration, tin.ease,
        tout.type, tout.duration, tout.ease,

        // background-only fields (leave blank for graphics)
        "", "", "", "", "",
        "", "", "", "",
        "", "",
      ]);
    }
  }

  // ---- BACKGROUNDS as their own rows ----
  const BG_KINDS = new Set(["color", "gradient", "image"]);
  const asBgKind = (value: any) => {
    if (typeof value !== "string") return "";
    const lower = value.toLowerCase();
    return BG_KINDS.has(lower) ? lower : "";
  };
  const resolveBackgroundKind = (obj: any): string => {
    if (!obj || typeof obj !== "object") return "";
    const candidates = [
      obj.meta?.kind,
      obj.meta?.type,
      obj.kind,
      obj.type,
      obj.backgroundType,
      obj.meta?.backgroundType,
    ];
    for (const cand of candidates) {
      const kind = asBgKind(cand);
      if (kind) return kind;
    }
    return "";
  };

  const mergeBackgroundSources = (track: any, item: any | null) => {
    const baseMeta = { ...(track?.meta ?? {}) };
    if (item?.meta) {
      return {
        ...(track ?? {}),
        ...(item ?? {}),
        meta: { ...baseMeta, ...item.meta },
      };
    }
    return {
      ...(track ?? {}),
      ...(item ?? {}),
      meta: baseMeta,
    };
  };

  type NormalizedBackground = {
    trackId: string;
    clipId: string;
    displayName: string;
    kind: string;
    start: number;
    end: number;
    duration: number;
    transitionIn?: any;
    transitionOut?: any;
    source: any;
  };

  const collectBackgroundRows = (input: any[]): NormalizedBackground[] => {
    const out: NormalizedBackground[] = [];
    (input ?? []).forEach((track: any, ti: number) => {
      if (!track) return;
      const trackId = str(track.id ?? `background-track-${ti}`);
      const trackName = str(track.name ?? "Background");
      const clipList = Array.isArray(track.clips) ? track.clips.filter(Boolean) : [];

      if (clipList.length) {
        clipList.forEach((clip: any, ci: number) => {
          const kind = resolveBackgroundKind(clip) || resolveBackgroundKind(clip?.meta);
          if (!kind) return;
          const startFrame = Number.isFinite(clip?.startTime)
            ? num(clip.startTime)
            : Number.isFinite(track?.startTime)
            ? num(track.startTime)
            : 0;
          const endCandidate =
            Number.isFinite(clip?.endTime) ? Number(clip.endTime)
            : Number.isFinite(clip?.duration) ? startFrame + num(clip.duration)
            : Number.isFinite(track?.endTime) ? Number(track.endTime)
            : startFrame + num(track?.duration);
          const endFrame = Number.isFinite(endCandidate) ? endCandidate : startFrame;
          const durationFrame = Math.max(0, endFrame - startFrame);

          const start = secToFrames(startFrame, fps);
          const end = secToFrames(endFrame, fps);
          const duration = Math.max(0, endFrame - startFrame);

          const source = mergeBackgroundSources(track, clip);
          out.push({
            trackId,
            clipId: str(clip?.id ?? `${trackId}:${ci}`),
            displayName: str(clip?.name ?? clip?.title ?? trackName),
            kind,
            start,
            end,
            duration,
            transitionIn:
              clip?.transitionIn ??
              clip?.meta?.transitionIn ??
              track?.transitionIn ??
              track?.meta?.transitionIn,
            transitionOut:
              clip?.transitionOut ??
              clip?.meta?.transitionOut ??
              track?.transitionOut ??
              track?.meta?.transitionOut,
            source,
          });
        });
        return;
      }

      const kind = resolveBackgroundKind(track) || resolveBackgroundKind(track?.meta);
      if (!kind) return;
      const startFrame = Number.isFinite(track?.startTime) ? num(track.startTime) : 0;
      const endCandidate =
        Number.isFinite(track?.endTime) ? Number(track.endTime)
        : startFrame + (Number.isFinite(track?.duration) ? num(track.duration) : 0);
      const endFrame = Number.isFinite(endCandidate) ? endCandidate : startFrame;
      const durFrame = Math.max(0, endFrame - startFrame);

      const start = secToFrames(startFrame, fps);
      const end = secToFrames(endFrame, fps);
      const duration = Math.max(0, endFrame - startFrame);

      const source = mergeBackgroundSources(track, null);
      out.push({
        trackId,
        clipId: `${trackId}:track`,
        displayName: trackName,
        kind,
        start,
        end,
        duration,
        transitionIn: track?.transitionIn ?? track?.meta?.transitionIn,
        transitionOut: track?.transitionOut ?? track?.meta?.transitionOut,
        source,
      });
    });
    return out;
  };

  const normalizedBackgroundRows = collectBackgroundRows(backgroundTracks ?? []);

  for (const bgRow of normalizedBackgroundRows) {
    const tin = serializeTransition(bgRow.transitionIn);
    const tout = serializeTransition(bgRow.transitionOut);
    const bgMeta = serializeBackgroundMeta(bgRow.source);
    const sanitizedName = sanitizeDisplayLabel(bgRow.displayName, bgRow.source);
    const sanitizedImageSrc = sanitizeFileLikeValue(bgMeta.imageSrc, bgRow.source, sanitizedName);
    bgMeta.imageSrc = sanitizedImageSrc;
    if (bgRow.kind === "image") {
      const sanitizedValue = sanitizeFileLikeValue(bgMeta.value, bgRow.source, sanitizedName);
      if (sanitizedValue) bgMeta.value = sanitizedValue;
    }

    rows.push([
      "background",
      bgRow.trackId,
      bgRow.clipId,
      sanitizedName,
      bgRow.kind,
      String(bgRow.start),
      String(bgRow.end),
      String(bgRow.duration),

      // geometry not applicable
      "", "", "", "",
      "", "", "", "", "", "",
      "", "",

      // transitions
      tin.type, tin.duration, tin.ease,
      tout.type, tout.duration, tout.ease,

      // background meta
      bgMeta.kind,
      bgMeta.color,
      bgMeta.gradientType,
      bgMeta.gradientAngleDeg,
      bgMeta.gradientStops,
      bgMeta.imageSrc,
      bgMeta.gradientDirection,
      bgMeta.gradientColors,
      bgMeta.imageFit,
      bgMeta.value,
    ]);
  }

  // CSV join
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [
    headers.map(esc).join(","),
    ...rows.map(r => r.map(v => esc(v ?? "")).join(",")),
  ].join("\n");
}


/* ----------------------------- CSV → Tracks ----------------------------- */

function secFromFrames(frames: any, fps: number) {
  const f = n(frames);
  return fps > 0 ? f / fps : 0;
}

/** Actions CSV → one new animation track */
export function importActionsFromCSV(csvText: string, fps: number, defaultCharacterSet: string): any {
  const { headers, rows } = parseCSV(csvText);
  const idx = {
    character_set: headers.indexOf("character_set"),
    action_name: headers.indexOf("action_name"),
    start_frame: headers.indexOf("start_frame"),
    end_frame: headers.indexOf("end_frame"),
  };
  if (idx.action_name < 0 || idx.start_frame < 0 || idx.end_frame < 0) {
    throw new Error("CSV must include columns: action_name, start_frame, end_frame (character_set optional).");
  }

  const clips: any[] = [];
  let firstSet: string | null = null;
  for (const r of rows) {
    const setLabel = idx.character_set >= 0 ? (r[idx.character_set] || "").trim() : "";
    const action = (r[idx.action_name] || "").trim();
    if (!action) continue;
    const start = secFromFrames(r[idx.start_frame], fps);
    const end = secFromFrames(r[idx.end_frame], fps);
    const s0 = Math.max(0, Math.min(start, end));
    const e0 = Math.max(s0, Math.max(start, end));
    const duration = Math.max(0.01, e0 - s0);
    if (!firstSet && setLabel) firstSet = setLabel;

    clips.push({
      id: `csv-action-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      animationId: action,
      name: action,
      startTime: s0,
      endTime: e0,
      duration,
      label: action,
      meta: { characterSet: setLabel || defaultCharacterSet },
    });
  }

  return {
    id: `track-actions-${Date.now()}`,
    name: `Imported Actions${firstSet ? ` (${firstSet})` : ""}`,
    type: "animation",
    clips,
  };
}

/** Graphics CSV → one new graphic track */
export function importGraphicsFromCSV(csvText: string, fps: number): any {
  const { headers, rows } = parseCSV(csvText);
  const idx = {
    graphic_name: headers.indexOf("graphic_name"),
    start_frame: headers.indexOf("start_frame"),
    end_frame: headers.indexOf("end_frame"),
  };
  if (idx.graphic_name < 0 || idx.start_frame < 0 || idx.end_frame < 0) {
    throw new Error("CSV must include columns: graphic_name, start_frame, end_frame.");
  }

  const clips: any[] = [];
  for (const r of rows) {
    const name = (r[idx.graphic_name] || "").trim();
    if (!name) continue;
    const start = secFromFrames(r[idx.start_frame], fps);
    const end = secFromFrames(r[idx.end_frame], fps);
    const s0 = Math.max(0, Math.min(start, end));
    const e0 = Math.max(s0, Math.max(start, end));
    const duration = Math.max(0.01, e0 - s0);

    clips.push({
      id: `csv-graphic-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      graphicId: name,
      name,
      startTime: s0,
      endTime: e0,
      duration,
      label: name,
    });
  }

  return {
    id: `track-graphics-${Date.now()}`,
    name: `Imported Graphics`,
    type: "graphic",
    clips,
  };
}

/* ------------------------- Project JSON (optional) ------------------------ */

export type SerializedProject = {
  version: number;
  tracks: Track[];
  // Extend with audio/background/customThumbnails as needed
  graphics?: GraphicTimelineClip[];
  customThumbnails?: Record<string, string>;
};

export function serializeProject(state: {
  tracks: Track[];
  graphics?: GraphicTimelineClip[];
  customThumbnails?: Record<string, string>;
}): SerializedProject {
  return {
    version: 1,
    tracks: state.tracks ?? [],
    graphics: state.graphics ?? [],
    customThumbnails: state.customThumbnails ?? {},
  };
}

export function downloadProjectJSON(project: SerializedProject, filename = "project.json") {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

export async function readProjectJSONFromFile(file: File): Promise<SerializedProject> {
  const text = await file.text();
  const json = JSON.parse(text);
  if (!json || typeof json !== "object") throw new Error("Invalid project JSON");
  return {
    version: Number(json.version) || 1,
    tracks: Array.isArray(json.tracks) ? json.tracks : [],
  };
}

export function toDomain(serialized: SerializedProject): { tracks: Track[] } {
  return {
    tracks: serialized.tracks ?? [],
  };
}
