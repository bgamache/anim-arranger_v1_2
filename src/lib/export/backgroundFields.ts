// Compute additive pixel  frame fields for background CSV rows.
// Safe to drop in without refactoring upstream names.
export type FpsInput = number | { fps: number };

function fpsOf(f: FpsInput): number {
  return typeof f === "number" ? f : f?.fps ?? 30;
}

function toSeconds(v: unknown): number {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return n > 1000 ? n / 1000 : n;
}

function toFrames(seconds: number, fps: number): number {
  return Math.round(seconds * fps);
}

type AnyRow = Record<string, unknown>;

export type BackgroundAugmented = {
  bg_x_px: number;
  bg_y_px: number;
  bg_w_px: number;
  bg_h_px: number;
  bg_start_frame: number;
  bg_end_frame: number;
  bg_duration_frames: number;
};

export function addBackgroundExportFields<T extends AnyRow>(
  row: T,
  fpsIn: FpsInput
): T & BackgroundAugmented {
  const fps = fpsOf(fpsIn);

  // Be flexible with upstream keys:
  const x = Number(row.x_px ?? row.x ?? 0);
  const y = Number(row.y_px ?? row.y ?? 0);
  const w = Number(row.w_px ?? row.width_px ?? row.w ?? row.width ?? 0);
  const h = Number(row.h_px ?? row.height_px ?? row.h ?? row.height ?? 0);

  const startS =
    row.start_s != null ? toSeconds(row.start_s)
    : row.startSeconds != null ? toSeconds(row.startSeconds)
    : row.start != null ? toSeconds(row.start)
    : row.start_frame != null ? Number(row.start_frame) / fps
    : 0;

  const endS =
    row.end_s != null ? toSeconds(row.end_s)
    : row.endSeconds != null ? toSeconds(row.endSeconds)
    : row.end != null ? toSeconds(row.end)
    : row.end_frame != null ? Number(row.end_frame) / fps
    : startS + toSeconds(row.duration ?? row.duration_s ?? 0);

  const startF = toFrames(startS, fps);
  const endF = toFrames(endS, fps);
  const durF = Math.max(0, endF - startF);

  return {
    ...row,
    bg_x_px: Math.round(x),
    bg_y_px: Math.round(y),
    bg_w_px: Math.round(w),
    bg_h_px: Math.round(h),
    bg_start_frame: startF,
    bg_end_frame: endF,
    bg_duration_frames: durF,
  };
}


