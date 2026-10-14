// Two animation frames provide a paint opportunity, not a browser paint-time
// guarantee. Keep this separate from data restoration and interaction readiness.
export function afterPaintOpportunity(
  callback: () => void,
  requestFrame: (callback: FrameRequestCallback) => number,
  cancelFrame: (id: number) => void,
): () => void {
  let cancelled = false;
  let frame = requestFrame(() => {
    if (cancelled) return;
    frame = requestFrame(() => {
      if (!cancelled) callback();
    });
  });
  return () => {
    cancelled = true;
    cancelFrame(frame);
  };
}
