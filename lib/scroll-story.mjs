/** @param {number} value */
export function clampProgress(value) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * Native scroll position, not a timer, drives the decorative film and chapters.
 * @param {{top:number,height:number,viewport:number,pinned:boolean}} geometry
 */
export function storyFrame({ top, height, viewport, pinned }) {
  const progress = clampProgress(pinned
    ? -top / Math.max(1, height - viewport)
    : (viewport * .85 - top) / Math.max(1, Math.min(height, viewport * .85)));
  return {
    progress,
    reply: clampProgress((progress - .16) / .3),
    booking: clampProgress((progress - .52) / .3),
    step: progress < .32 ? 0 : progress < .68 ? 1 : 2,
  };
}

/** @param {number} duration @param {number} progress */
export function storyTime(duration, progress) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, duration - .08) * clampProgress(progress);
}
