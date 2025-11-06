// Base interfaces
/** Optional metadata carried with clips (used for exports, provenance, etc.) */
export type ClipMetadata = {
  /** e.g. "Brave", "Strider", "Dash" — used for CSV export */
  characterSet?: string;
  /** Optional provenance fields if you carry them */
  sourceSetId?: string;
  sourceSetName?: string;
  fileName?: string;
  filename?: string;
  originalFileName?: string;
  originalFilename?: string;
};

export interface AnimationClip {
  id: string;
  name: string;
  type: string;
  duration: number;
  icon: string;
  description: string;
  imageUrl?: string;
  meta?: ClipMetadata;
}

export interface TimelineClip {
  id: string;
  animationId: string;
  name: string;
  startTime: number;
  duration: number;
  endTime?: number;
  type: "fade" | "slide" | "zoom" | "rotate" | "bounce" | "elastic";
  icon: string;
  description: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  meta?: ClipMetadata;
}

export interface GraphicClip {
  id: string;
  name: string;
  type: "text" | "shape" | "icon";
  icon: string;
  description: string;
  color: string;
  content?: string; // For text elements
  imageUrl?: string;
  meta?: ClipMetadata;
}

export type TransitionKey =
  | "none"
  | "fade-in"
  | "fade-out"
  | "scale-in-center" | "scale-out-center"
  | "slide-in-left" | "slide-in-right" | "slide-in-up" | "slide-in-down"
  | "slide-out-left" | "slide-out-right" | "slide-out-up" | "slide-out-down";

export interface TransitionSpec {
  type: TransitionKey;              // single discriminant
  duration: number;                 // ms
  ease: string;                     // e.g. "ease", "linear", "ease-in-out"
  // Optional params when relevant:
  axis?: "x" | "y";
  distance?: number;                // px
  scaleFrom?: number;               // e.g. 0.9
  opacityFrom?: number;             // e.g. 0
}

// This shapes the picker UI (group + label + spec)
export interface TransitionPreset {
  key: TransitionKey;
  label: string;
  group: "Fade" | "Slide" | "Scale" | "None";
  spec: TransitionSpec;
}

// Single source of truth for the picker + defaults:
export const TRANSITION_PRESETS: TransitionPreset[] = [
  { key: "none", label: "None", group: "None", spec: { type: "none", duration: 0, ease: "linear" } },

  { key: "fade-in", label: "Fade In", group: "Fade",
    spec: { type: "fade-in", duration:600, ease: "ease", opacityFrom: 0 } },

  { key: "fade-out", label: "Fade Out", group: "Fade",
    spec: { type: "fade-out", duration:600, ease: "ease" } },

  { key: "scale-in-center", label: "Scale In (Center)", group: "Scale",
    spec: { type: "scale-in-center", duration: 400, ease: "ease-out", scaleFrom: 0.9, opacityFrom: 0 } },
  { key: "scale-out-center", label: "Scale Out (Center)", group: "Scale",
    spec: { type: "scale-out-center", duration: 400, ease: "ease-in" } },

  { key: "slide-in-left", label: "Slide In — Left", group: "Slide",
    spec: { type: "slide-in-left", duration: 400, ease: "ease-out", axis: "x", distance: 40, opacityFrom: 0 } },
  { key: "slide-in-right", label: "Slide In — Right", group: "Slide",
    spec: { type: "slide-in-right", duration: 400, ease: "ease-out", axis: "x", distance: 40, opacityFrom: 0 } },
  { key: "slide-in-up", label: "Slide In — Up", group: "Slide",
    spec: { type: "slide-in-up", duration: 400, ease: "ease-out", axis: "y", distance: 40, opacityFrom: 0 } },
  { key: "slide-in-down", label: "Slide In — Down", group: "Slide",
    spec: { type: "slide-in-down", duration: 400, ease: "ease-out", axis: "y", distance: 40, opacityFrom: 0 } },

  { key: "slide-out-left", label: "Slide Out — Left", group: "Slide",
    spec: { type: "slide-out-left", duration: 400, ease: "ease-in", axis: "x", distance: 40 } },
  { key: "slide-out-right", label: "Slide Out — Right", group: "Slide",
    spec: { type: "slide-out-right", duration: 400, ease: "ease-in", axis: "x", distance: 40 } },
  { key: "slide-out-up", label: "Slide Out — Up", group: "Slide",
    spec: { type: "slide-out-up", duration: 400, ease: "ease-in", axis: "y", distance: 40 } },
  { key: "slide-out-down", label: "Slide Out — Down", group: "Slide",
    spec: { type: "slide-out-down", duration: 400, ease: "ease-in", axis: "y", distance: 40 } },
];

// Convenience maps if you want fast lookups:
export const TRANSITION_MAP: Record<TransitionKey, TransitionSpec> =
  Object.fromEntries(TRANSITION_PRESETS.map(p => [p.key, p.spec])) as any;

export const TRANSITION_GROUPS = ["None", "Fade", "Slide", "Scale"] as const;

export interface GraphicTimelineClip {
  id: string;
  graphicId: string;
  name: string;
  startTime: number;
  duration: number;
  endTime?: number;
  type: "text" | "shape" | "icon";
  icon: string;
  description: string;
  color: string;
  content?: string;
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  textColor?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  meta?: ClipMetadata;
  // NEW – optional so old projects don’t break
  transitionsIn?: TransitionSpec;
  transitionsOut?: TransitionSpec;
}

export interface AudioTrack {
  id: string;
  name: string;
  audioUrl: string;
  startTime: number;
  duration: number;
  endTime?: number;
  volume: number;
}
export type BackgroundKind = "color" | "gradient" | "image";

export interface BackgroundGradientStop {
  offset: number; // 0..1
  color: string;  // css color
}

export interface BackgroundGradientMeta {
  kind: "gradient";
  angleDeg?: number; // e.g. 0..360
  type?: "linear" | "radial";
  stops: BackgroundGradientStop[];
  gradientDirection?: string;
  colors?: string[];
}

export interface BackgroundColorMeta {
  kind: "color";
  color: string;
}

export interface BackgroundImageMeta {
  kind: "image";
  src: string;
  // optional transition metadata too
  transitionIn?: TransitionSpec;
  transitionOut?: TransitionSpec;
  fileName?: string;
  filename?: string;
  originalFileName?: string;
  originalFilename?: string;
}

export type BackgroundMeta = BackgroundGradientMeta | BackgroundColorMeta | BackgroundImageMeta;

export interface BackgroundClipLike {
  id: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  meta?: BackgroundMeta & { transitionIn?: TransitionSpec; transitionOut?: TransitionSpec };
  name?: string;
}

export interface BackgroundTrack {
  id: string;
  name?: string;
  // Some apps keep backgrounds as clips, some as a single object; supporting both:
  clips?: BackgroundClipLike[];
  // or flat:
  startTime?: number;
  endTime?: number;
  duration?: number;
  meta?: BackgroundMeta & { transitionIn?: TransitionSpec; transitionOut?: TransitionSpec };
}

export const isBackgroundClipLike = (b: any): b is BackgroundClipLike =>
  b && typeof b === "object" && ("startTime" in b) && ("meta" in b);


export interface BackgroundTimelineClip {
  id: string;
  backgroundId?: string;
  name: string;
  startTime: number;
  duration: number;
  endTime?: number;
  type: "color" | "gradient" | "image" | "video";
  value: string;
  color?: string;
  gradientColors?: string[];
  gradientDirection?: string;
  imageUrl?: string;
  imageFit?: string;
}

// New flexible track system
export interface Track {
  id: string;
  name: string;
  clips: (TimelineClip | GraphicTimelineClip | BackgroundTimelineClip)[];
  color?: string;
  isBackground?: boolean;
}
