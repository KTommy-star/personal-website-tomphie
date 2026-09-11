const START_VIEWPORT_RATIO = 0.72;
const END_VIEWPORT_RATIO = 0.28;

export function calculateRouteProgress(
  lineTop: number,
  lineBottom: number,
  viewportHeight: number,
): number {
  const lineHeight = Math.max(0, lineBottom - lineTop);
  const viewportTravel = Math.max(
    1,
    lineHeight + viewportHeight * (START_VIEWPORT_RATIO - END_VIEWPORT_RATIO),
  );
  const progress = (viewportHeight * START_VIEWPORT_RATIO - lineTop) / viewportTravel;

  return Math.min(1, Math.max(0, progress));
}
