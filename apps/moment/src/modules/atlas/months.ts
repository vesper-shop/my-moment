import type { AtlasMonth, PhotoItem } from "~/types";

export function groupMonths(photos: readonly PhotoItem[], today: string): AtlasMonth[] {
  const months = new Map<string, Map<string, PhotoItem[]>>([[today.slice(0, 7), new Map()]]);
  const dated = photos
    .flatMap((photo) => (photo.date ? [{ photo, date: photo.date }] : []))
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const { photo, date } of dated) {
    const day = date.length === 10 ? date : new Date(date).toLocaleDateString("en-CA");
    let month = months.get(day.slice(0, 7));
    if (!month) {
      month = new Map();
      months.set(day.slice(0, 7), month);
    }
    const list = month.get(day);
    if (list) list.push(photo);
    else month.set(day, [photo]);
  }
  return [...months.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, days]) => ({
      month,
      days,
      count: [...days.values()].reduce((total, list) => total + list.length, 0),
    }));
}
