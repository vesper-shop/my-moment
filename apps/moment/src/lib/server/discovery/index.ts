import type { PhotoItem } from "~/types";
import type { JsonObject } from "~/types/json";
import { PUBLIC_PAGE_META, SITE_NAME } from "~/lib/seo";

export const DISCOVERY_LIMIT = 5000;
const FEED_PHOTO_LIMIT = 50;
const SUMMARY_LENGTH = 160;

const DISALLOWED_PATHS = ["/upload", "/collection/add", "/haul/add", "/wish/add", "/*/edit"];

const IMAGE_MIME_TYPES: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  avif: "image/avif",
};

const API_DOCUMENTATION_URL = "https://github.com/Pleasurecruise/my-moment#api";

export const API_LINK_HEADER = [
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
  `<${API_DOCUMENTATION_URL}>; rel="service-doc"; type="text/html"`,
  '</llms.txt>; rel="describedby"; type="text/plain"',
].join(", ");

export function mimeType(path: string): string {
  const ext = path.split("?")[0]?.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_MIME_TYPES[ext] ?? "application/octet-stream";
}

export function photoUrl(origin: string, id: string): string {
  return new URL(`/?photo=${encodeURIComponent(id)}`, origin).href;
}

export function photoTitle(photo: Pick<PhotoItem, "title">): string {
  return photo.title.trim() || "Untitled moment";
}

export function photoSummary(photo: Pick<PhotoItem, "description">): string {
  const plain = (photo.description ?? "").replace(/\s+/g, " ").trim();
  if (plain.length === 0) return `A photographed moment from ${SITE_NAME}.`;
  return plain.length > SUMMARY_LENGTH ? `${plain.slice(0, SUMMARY_LENGTH)}…` : plain;
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeMarkdownLinkText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

export function robotsTxt(origin: string): string {
  return [
    "User-agent: *",
    "Allow: /",
    "Allow: /api/og/",
    "Allow: /api/photos/",
    "Allow: /api/openapi.json",
    "Disallow: /api/",
    ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
    "",
    `Sitemap: ${new URL("/sitemap.xml", origin).href}`,
    "",
  ].join("\n");
}

export function sitemapXml(photos: readonly PhotoItem[], origin: string): string {
  // Photos arrive most recently updated first.
  const newest = photos.length > 0 ? photos[0].updatedAt : null;
  const entries = [
    ...Object.values(PUBLIC_PAGE_META).map((page) => ({
      loc: new URL(page.path, origin).href,
      lastmod: page.path === "/" ? newest : null,
    })),
    ...photos.map((photo) => ({ loc: photoUrl(origin, photo.id), lastmod: photo.updatedAt })),
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((entry) =>
      [
        "  <url>",
        `    <loc>${escapeXml(entry.loc)}</loc>`,
        ...(entry.lastmod ? [`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`] : []),
        "  </url>",
      ].join("\n"),
    ),
    "</urlset>",
    "",
  ].join("\n");
}

export function rssXml(photos: readonly PhotoItem[], origin: string): string {
  const feedUrl = new URL("/rss.xml", origin).href;
  const homeUrl = new URL("/", origin).href;
  const lastBuildDate = photos.length > 0 ? photos[0].updatedAt : null;
  const items = photos.slice(0, FEED_PHOTO_LIMIT).map((photo) => {
    const url = photoUrl(origin, photo.id);
    const published = photo.date ? new Date(photo.date) : null;
    return [
      "    <item>",
      `      <title>${escapeXml(photoTitle(photo))}</title>`,
      `      <description>${escapeXml(photoSummary(photo))}</description>`,
      `      <link>${escapeXml(url)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
      ...(published && !Number.isNaN(published.getTime())
        ? [`      <pubDate>${published.toUTCString()}</pubDate>`]
        : []),
      ...photo.tags.map((tag) => `      <category>${escapeXml(tag)}</category>`),
      "    </item>",
    ].join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(SITE_NAME)}</title>`,
    `    <description>${escapeXml(PUBLIC_PAGE_META.gallery.description)}</description>`,
    `    <link>${escapeXml(homeUrl)}</link>`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>`,
    "    <language>en</language>",
    ...(lastBuildDate
      ? [`    <lastBuildDate>${new Date(lastBuildDate).toUTCString()}</lastBuildDate>`]
      : []),
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

export function llmsTxt(photos: readonly PhotoItem[], origin: string): string {
  const sections = Object.values(PUBLIC_PAGE_META).map(
    (page) =>
      `- [${escapeMarkdownLinkText(page.title)}](${new URL(page.path, origin).href}): ${page.description}`,
  );
  const moments = photos.map((photo) => {
    const parts: string[] = [];
    if (photo.date) parts.push(photo.date.slice(0, 10));
    if (photo.description) parts.push(photoSummary(photo));
    const detail = parts.join(" — ");
    const tags = photo.tags.length > 0 ? ` (${photo.tags.map((tag) => `#${tag}`).join(" ")})` : "";
    return `- [${escapeMarkdownLinkText(photoTitle(photo))}](${photoUrl(origin, photo.id)})${detail ? `: ${detail}` : ""}${tags}`;
  });
  return [
    `# ${SITE_NAME}`,
    "",
    `> ${PUBLIC_PAGE_META.gallery.description}`,
    "",
    "Each photo page is canonical. Photos are listed most recently updated first.",
    `An RSS feed of recent photos is available at ${new URL("/rss.xml", origin).href}.`,
    "",
    "## API",
    "",
    `- [REST API](${new URL("/api/openapi.json", origin).href}): ${new URL("/api", origin).href} for photos (list, search, read, write) and tags. Reads need no token; writes require \`Authorization: Bearer <access token>\` issued by you-find.me or the owner session.`,
    `- [MCP](${new URL("/api/mcp", origin).href}): Stateless MCP endpoint with the same Bearer key.`,
    `- [Anime](${new URL("/api/media?kind=anime", origin).href}): Watched anime with notes and dates, no key required; films at ${new URL("/api/media?kind=film", origin).href}.`,
    `- [Haul](${new URL("/api/haul", origin).href}): Purchases with brand, price, rating and comments, no key required.`,
    `- [Wishlist](${new URL("/api/wish", origin).href}): Wanted items with brand and price, no key required.`,
    `- [Music](${new URL("/api/music", origin).href}): The public Spotify playlist, no key required.`,
    "",
    "## Sections",
    "",
    ...sections,
    "",
    "## Moments",
    "",
    ...(moments.length > 0 ? moments : ["No photos are available."]),
    "",
  ].join("\n");
}

export function apiCatalog(origin: string): JsonObject {
  return {
    linkset: [
      {
        anchor: new URL("/api", origin).href,
        "service-desc": [
          {
            href: new URL("/api/openapi.json", origin).href,
            type: "application/vnd.oai.openapi+json",
          },
        ],
        "service-doc": [{ href: API_DOCUMENTATION_URL, type: "text/html" }],
      },
    ],
  };
}

export function photoJsonLd(photo: PhotoItem, origin: string): JsonObject {
  const url = photoUrl(origin, photo.id);
  return {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    name: photoTitle(photo),
    description: photoSummary(photo),
    url,
    mainEntityOfPage: url,
    contentUrl: new URL(photo.url, origin).href,
    thumbnailUrl: new URL(photo.thumbnailUrl, origin).href,
    encodingFormat: mimeType(photo.url),
    ...(photo.width > 0 ? { width: photo.width } : {}),
    ...(photo.height > 0 ? { height: photo.height } : {}),
    ...(photo.date ? { dateCreated: photo.date } : {}),
    dateModified: photo.updatedAt,
    ...(photo.tags.length > 0 ? { keywords: photo.tags } : {}),
    ...(photo.geo
      ? {
          contentLocation: {
            "@type": "Place",
            geo: {
              "@type": "GeoCoordinates",
              latitude: photo.geo.lat,
              longitude: photo.geo.lng,
            },
          },
        }
      : {}),
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: new URL("/", origin).href },
  };
}

export function websiteJsonLd(origin: string): JsonObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    description: PUBLIC_PAGE_META.gallery.description,
    url: new URL("/", origin).href,
  };
}

/** Serializes JSON-LD so it cannot close the surrounding script element. */
export function toJsonLd(data: JsonObject): string {
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}

export function publicResponse(body: string, contentType: string): Response {
  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=3600",
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Serves a request-independent response through the Workers Cache API.
 * Worker-generated responses are not cached automatically, so the edge copy
 * must be stored explicitly with `cache.put`.
 */
export async function edgeCache(
  request: Request,
  ctx: Pick<ExecutionContext, "waitUntil">,
  build: () => Promise<Response>,
): Promise<Response> {
  const cache = await caches.open("discovery");
  const cacheKey = new Request(new URL(request.url).href, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const response = await build();
  if (response.ok) ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
