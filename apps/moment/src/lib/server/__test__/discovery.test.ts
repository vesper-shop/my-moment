import { describe, expect, it } from "vite-plus/test";
import type { PhotoItem } from "~/types";
import { llmsTxt, photoJsonLd, rssXml, toJsonLd } from "../discovery";

const origin = "https://moment.example";

function photo(overrides: Partial<PhotoItem> = {}): PhotoItem {
  return {
    id: "photo-1",
    url: "/api/photos/photo-1.webp",
    thumbnailUrl: "/api/photos/img/thumbnails/photo-1.webp",
    title: "Harbor [dusk]",
    width: 800,
    height: 600,
    tags: ["sea"],
    date: "2026-08-01",
    description: "Boats\nat <night> & rain",
    updatedAt: "2026-08-03T10:00:00.000Z",
    ...overrides,
  };
}

describe("discovery documents", () => {
  it("escapes markdown link text and collapses descriptions in llms.txt", () => {
    const llms = llmsTxt([photo()], origin);
    expect(llms).toContain(
      "- [Harbor \\[dusk\\]](https://moment.example/?photo=photo-1): 2026-08-01 — Boats at <night> & rain (#sea)",
    );
  });

  it("lists the read-only API entry point before the content in llms.txt", () => {
    const llms = llmsTxt([photo()], origin);
    expect(llms).toContain("- [Anime](https://moment.example/api/media?kind=anime)");
    expect(llms.indexOf("## API")).toBeLessThan(llms.indexOf("## Moments"));
  });

  it("escapes XML in the RSS feed", () => {
    const rss = rssXml([photo()], origin);
    expect(rss).toContain("<description>Boats at &lt;night&gt; &amp; rain</description>");
    expect(rss).toContain("<category>sea</category>");
  });

  it("serializes JSON-LD without closing the script element", () => {
    const serialized = toJsonLd(photoJsonLd(photo(), origin));
    expect(serialized).not.toContain("</");
    expect(JSON.parse(serialized)).toMatchObject({
      "@type": "ImageObject",
      contentUrl: "https://moment.example/api/photos/photo-1.webp",
      encodingFormat: "image/webp",
    });
  });
});
