export type ClipLike = { start: number; duration: number };

export function endOf(clip: ClipLike): number {
  return clip.start + clip.duration;
}

export function overlaps(a: ClipLike, b: ClipLike): boolean {
  return a.start < endOf(b) && b.start < endOf(a);
}

export function clampToTimeline(clip: ClipLike, min = 0, max = Infinity): ClipLike {
  const start = Math.max(min, Math.min(clip.start, Math.max(min, max)));
  const end = Math.min(endOf({ start, duration: clip.duration }), max);
  const duration = Math.max(0, end - start);
  return { start, duration };
}

export function splitClip(clip: ClipLike, t: number): [ClipLike, ClipLike] | null {
  if (t <= clip.start || t >= endOf(clip)) return null;
  const left: ClipLike = { start: clip.start, duration: t - clip.start };
  const right: ClipLike = { start: t, duration: endOf(clip) - t };
  return [left, right];
}
