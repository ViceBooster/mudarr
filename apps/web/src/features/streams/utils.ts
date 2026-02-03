export const shuffleList = <T,>(items: T[]) => {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export const shuffleTracksForEdit = <T extends { id: number }>(tracks: T[]) =>
  tracks.length <= 1 ? tracks : shuffleList(tracks);

export const isSameTrackOrder = <T extends { id: number }>(a: T[], b: T[]) => {
  if (a.length !== b.length) return false;
  return a.every((track, index) => track.id === b[index]?.id);
};

export const getResolutionSummary = (items: Array<{ video_width?: number | null; video_height?: number | null }>) => {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.video_width || !item.video_height) continue;
    const label = `${item.video_width}×${item.video_height}`;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  if (counts.size === 0) return "Unknown";
  let best = "";
  let bestCount = 0;
  for (const [label, count] of counts) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }
  return best || "Unknown";
};

