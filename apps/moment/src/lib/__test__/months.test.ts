import { describe, expect, it } from "vite-plus/test";
import { groupMonths } from "~/modules/atlas/months";
import type { PhotoItem } from "~/types";

const base: PhotoItem = {
  id: "base",
  url: "/api/photos/base.png",
  thumbnailUrl: "/api/photos/thumbnails/base.jpg",
  r2Key: "img/base.png",
  thumbnailR2Key: "img/thumbnails/base.jpg",
  title: "base",
  width: 1,
  height: 1,
  tags: [],
  updatedAt: "2026-11-01T00:00:00.000Z",
};

describe("atlas months", () => {
  it("groups photos by local day, newest month first and oldest photo first", () => {
    const early = { ...base, id: "early", date: "2026-04-17T08:00:00" };
    const late = { ...base, id: "late", date: "2026-04-17T12:00:00" };
    const day = { ...base, id: "day", date: "2026-02-07" };
    const undated = { ...base, id: "undated" };

    const months = groupMonths([late, day, undated, early], "2026-11-06");

    expect(months.map((month) => [month.month, month.count])).toEqual([
      ["2026-11", 0],
      ["2026-04", 2],
      ["2026-02", 1],
    ]);
    expect(months[1].days.get("2026-04-17")).toEqual([early, late]);
    expect(months[2].days.get("2026-02-07")).toEqual([day]);
  });
});
