import { describe, expect, it } from "vite-plus/test";
import type { PhotoItem } from "~/types";
import { countTags, queryPhotos } from "../photos/repository";

const photo = (id: string, date: string, tags: string[], title = id): PhotoItem => ({
  id,
  url: `/api/photos/${id}/original`,
  thumbnailUrl: `/api/photos/${id}/thumb`,
  title,
  width: 4,
  height: 3,
  tags,
  date,
  updatedAt: date,
});

const photos = [
  photo("a", "2026-01-01T00:00:00.000Z", ["street"]),
  photo("b", "2026-02-01T00:00:00.000Z", ["street", "night"], "Bridge at night"),
  photo("c", "2026-03-01T00:00:00.000Z", ["food"]),
];

const query = { tags: { names: [], mode: "any" as const }, order: "desc" as const, limit: 2 };

describe("photos read from Vesper", () => {
  it("pages newest first with a cursor", () => {
    const first = queryPhotos(photos, query);
    expect(first.photos.map((item) => item.id)).toEqual(["c", "b"]);
    const second = queryPhotos(photos, { ...query, cursor: first.nextCursor! });
    expect(second.photos.map((item) => item.id)).toEqual(["a"]);
    expect(second.nextCursor).toBeNull();
  });

  it("filters by tags, search and date range", () => {
    const all = { ...query, limit: 10 };
    const tagged = queryPhotos(photos, {
      ...all,
      tags: { names: ["street", "night"], mode: "all" },
    });
    expect(tagged.photos.map((item) => item.id)).toEqual(["b"]);
    const found = queryPhotos(photos, { ...all, search: "bridge" });
    expect(found.photos.map((item) => item.id)).toEqual(["b"]);
    const ranged = queryPhotos(photos, { ...all, fromDate: "2026-01-15", toDate: "2026-02-28" });
    expect(ranged.photos.map((item) => item.id)).toEqual(["b"]);
  });

  it("counts tags, most used first", () => {
    expect(countTags(photos)).toEqual([
      { name: "street", count: 2 },
      { name: "food", count: 1 },
      { name: "night", count: 1 },
    ]);
  });
});
