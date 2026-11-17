import { Hono } from "hono";
import {} from "zod";
import type { WorkerEnv } from "~/lib/server/access";
import {
  countPhotos,
  getPhoto,
  isValidCursor,
  loadPhotos,
  listPhotos,
  listRecentPhotos,
  listTagCounts,
  photoImage,
} from "~/lib/server/photos/repository";
import { haulItems, mediaItems, wishlistItems } from "~/lib/server/collection/static";
import { callback, authorize, readProfile } from "~/lib/server/vesper";
import { photoListQuerySchema } from "~/lib/server/photos/schema";
import type { JsonObject } from "~/types/json";
import { getSpotifyMusic } from "~/lib/server/spotify";
import { mediaKindSchema } from "~/types/media";
import { renderOgImage, renderOgPhoto, renderOgPng, type OgDot } from "~/lib/server/og";
import { getOgImageVersion, readOgImageKv, writeOgImageKv } from "~/lib/server/og/cache";
import type { WorkerBindings } from "~/types";
import { PUBLIC_PAGE_META, SITE_NAME, SITE_ORIGIN, type PublicPageKey } from "~/lib/seo";
import { MAPBOX_TOKEN } from "~/lib/map";
import { DEFAULT_GROUPS, groups } from "~/modules/atlas/places";
import {
  API_LINK_HEADER,
  DISCOVERY_LIMIT,
  apiCatalog,
  llmsTxt,
  robotsTxt,
  rssXml,
  sitemapXml,
  publicResponse,
  mimeType,
  photoJsonLd,
  photoSummary,
  photoTitle,
  photoUrl,
  toJsonLd,
  websiteJsonLd,
  edgeCache,
} from "~/lib/server/discovery";

const app = new Hono<WorkerEnv>();

interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  type?: "website" | "article";
  imageType?: string;
  robots?: string;
  notFound?: boolean;
  jsonLd?: JsonObject;
  /** Plain-text body for crawlers that do not run JavaScript. */
  fallback?: { heading: string; text: string; imageUrl?: string };
}

function absoluteUrl(origin: string, path: string): string {
  return new URL(path, origin).href;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

function ogImageUrl(origin: string, path: string): string {
  return absoluteUrl(origin, `${path}?v=${getOgImageVersion()}`);
}

function staticPageMeta(origin: string, key: PublicPageKey): PageMeta {
  const page = PUBLIC_PAGE_META[key];
  return {
    title: page.title,
    description: page.description,
    canonical: absoluteUrl(origin, page.path),
    image: ogImageUrl(origin, page.image),
    imageWidth: 1200,
    imageHeight: 630,
    imageType: "image/png",
    fallback: { heading: page.title, text: page.description },
  };
}

async function resolvePageMeta(url: URL, env: WorkerBindings): Promise<PageMeta> {
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path === "/") {
    const photoId = url.searchParams.get("photo");
    const photo = photoId ? await getPhoto(env, photoId) : null;
    if (photo) {
      const title = photoTitle(photo);
      const image = absoluteUrl(url.origin, photo.url);
      return {
        title: `${title} — ${SITE_NAME}`,
        description: photoSummary(photo),
        canonical: photoUrl(url.origin, photo.id),
        image: absoluteUrl(
          url.origin,
          `/api/og/photos/${photo.id}?v=${Date.parse(photo.updatedAt)}`,
        ),
        imageType: "image/png",
        imageWidth: 1200,
        imageHeight: 630,
        type: "article",
        jsonLd: photoJsonLd(photo, url.origin),
        fallback: {
          heading: title,
          text: photo.description ? photo.description.trim() : "",
          imageUrl: image,
        },
      };
    }
    return { ...staticPageMeta(url.origin, "gallery"), jsonLd: websiteJsonLd(url.origin) };
  }
  if (path === "/atlas") return staticPageMeta(url.origin, "atlas");
  if (path === "/messages" || path === "/snapshot") {
    return staticPageMeta(url.origin, "guestbook");
  }

  if (path === "/haul" || path === "/wish") {
    const view = path === "/wish" ? "wishlist" : "haul";
    const itemId = url.searchParams.get("item");
    if (itemId) {
      const resolved = await (async () => {
        if (view === "wishlist") {
          const item = wishlistItems.find((entry) => entry.id === itemId);
          return item
            ? {
                item,
                description: [item.brand, "Saved in the wishlist"].filter(Boolean).join(" · "),
              }
            : null;
        }

        const item = haulItems.find((entry) => entry.id === itemId);
        return item
          ? {
              item,
              description:
                item.comment || [item.brand, "Saved in the haul"].filter(Boolean).join(" · "),
            }
          : null;
      })();
      if (resolved) {
        const { item, description } = resolved;
        const image = item.imageUrl
          ? absoluteUrl(
              url.origin,
              `/cdn-cgi/image/width=1200,height=630,fit=pad,background=%23faf8f3,format=jpeg${item.imageUrl}`,
            )
          : ogImageUrl(url.origin, PUBLIC_PAGE_META[view].image);
        return {
          title: `${item.name} — ${SITE_NAME}`,
          description: description.slice(0, 160),
          canonical: absoluteUrl(url.origin, `${path}?item=${encodeURIComponent(item.id)}`),
          image,
          imageType: item.imageUrl ? "image/jpeg" : "image/png",
          imageWidth: 1200,
          imageHeight: 630,
          type: "article",
          fallback: {
            heading: item.name,
            text: description,
            ...(item.imageUrl ? { imageUrl: absoluteUrl(url.origin, item.imageUrl) } : {}),
          },
        };
      }
    }
    return staticPageMeta(url.origin, view);
  }

  if (path === "/collection") {
    return staticPageMeta(url.origin, "collection");
  }

  return {
    ...staticPageMeta(url.origin, "gallery"),
    title: `Not found — ${SITE_NAME}`,
    canonical: absoluteUrl(url.origin, path),
    robots: "noindex",
    notFound: true,
  };
}

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    service: "my-moment",
    runtime: "cloudflare-worker",
  }),
);

// First gallery page with the filter panel's tag counts, like memos' page load.
app.get("/api/gallery", async (c) => {
  const query = photoListQuerySchema.safeParse(c.req.query());
  if (!query.success) return c.json({ error: query.error.issues[0]?.message }, 400);
  if (query.data.cursor && !isValidCursor(query.data.cursor)) {
    return c.json({ error: "Invalid cursor." }, 400);
  }

  const [page, tags, total] = await Promise.all([
    listPhotos(c.env, query.data),
    listTagCounts(c.env),
    countPhotos(c.env),
  ]);
  return c.json({ ...page, tags, total });
});

app.get("/api/atlas", async (c) => {
  return c.json({ photos: await loadPhotos(c.env) });
});

// Later gallery pages, like memos' GET /api/memos.
app.get("/api/photos", async (c) => {
  const query = photoListQuerySchema.safeParse(c.req.query());
  if (!query.success) return c.json({ error: query.error.issues[0]?.message }, 400);
  if (query.data.cursor && !isValidCursor(query.data.cursor)) {
    return c.json({ error: "Invalid cursor." }, 400);
  }
  return c.json(await listPhotos(c.env, query.data));
});

// Photo ids never contain a dot, so stored files such as image1.png reach the R2 route below.
app.get("/api/photos/:id{[^./]+}", async (c) => {
  const id = c.req.param("id");
  const photo = await getPhoto(c.env, id);
  if (!photo) return c.json({ error: "Photo not found" }, 404);
  return c.json({ photo });
});

app.get("/api/og/photos/:id", async (c) => {
  const photo = await getPhoto(c.env, c.req.param("id"));
  if (!photo) return c.notFound();

  const pngHeaders = {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=86400, s-maxage=86400",
  };
  const section = `photo-${photo.id}`;
  const stamp = Date.parse(photo.updatedAt);
  const imageVersion = getOgImageVersion();
  const cached = await readOgImageKv(c.env.MOMENT_CACHE, section, stamp, imageVersion);
  if (cached) return new Response(cached, { headers: pngHeaders });

  const crop = await fetch(
    new URL(
      `/cdn-cgi/image/width=1240,height=1240,fit=scale-down,format=jpeg${photo.url}`,
      SITE_ORIGIN,
    ),
  );
  let image: string;
  if (crop.ok && crop.headers.get("Content-Type") === "image/jpeg") {
    image = `data:image/jpeg;base64,${arrayBufferToBase64(await crop.arrayBuffer())}`;
  } else {
    const thumbnail = await photoImage(c.env, photo.id, "thumb");
    if (!thumbnail) return c.notFound();
    image = `data:image/jpeg;base64,${arrayBufferToBase64(await thumbnail.arrayBuffer())}`;
  }

  const logo = await c.env.ASSETS.fetch(new Request(new URL("/favicon.png", c.req.url)));
  const svg = renderOgPhoto({
    title: photoTitle(photo),
    meta: [
      ...(photo.date
        ? [
            new Date(photo.date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            }),
          ]
        : []),
      ...photo.tags.slice(0, 1),
    ].join(" · "),
    logo: `data:image/png;base64,${arrayBufferToBase64(await logo.arrayBuffer())}`,
    image,
    ratio: photo.height > 0 ? photo.width / photo.height : 4 / 3,
  });
  const png = await renderOgPng(svg, c.env.MOMENT_CACHE);
  await writeOgImageKv(c.env.MOMENT_CACHE, section, stamp, imageVersion, png);
  return new Response(png, { headers: pngHeaders });
});

app.get("/api/og/:section", async (c) => {
  const section = c.req.param("section");
  const preview = c.req.query("preview") === "1";
  const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

  let title: string;
  let subtitle: string;
  let total: number;
  let urls: string[] = [];
  if (section === "gallery") {
    total = await countPhotos(c.env);
    title = "Gallery";
    subtitle = count(total, "moment");
    urls = (await listRecentPhotos(c.env, 3)).map((photo) => photo.thumbnailUrl);
  } else if (section === "haul") {
    total = haulItems.length;
    title = "Haul";
    subtitle = count(total, "item");
    urls = haulItems.flatMap((item) => (item.imageUrl ? [item.imageUrl] : [])).slice(0, 3);
  } else if (section === "wishlist") {
    total = wishlistItems.length;
    title = "Wishlist";
    subtitle = count(total, "item");
    urls = wishlistItems.flatMap((item) => (item.imageUrl ? [item.imageUrl] : [])).slice(0, 3);
  } else if (section === "collection") {
    const anime = mediaItems.filter((item) => item.kind === "anime");
    const film = mediaItems.filter((item) => item.kind === "film");
    total = anime.length + film.length;
    title = "Collection";
    subtitle = "Playlists, anime, films, and the things I love";
    urls = [anime, film].flatMap((items) =>
      items.flatMap((item) => (item.imageUrl ? [item.imageUrl] : [])).slice(0, 2),
    );
  } else if (section === "atlas") {
    total = 0;
    title = "Atlas";
    subtitle = "Places that became part of the story";
  } else if (section === "guestbook") {
    total = 0;
    title = "Guestbook";
    subtitle = "Notes left along the way";
  } else {
    return c.notFound();
  }

  const pngHeaders = {
    "Content-Type": "image/png",
    "Cache-Control": preview
      ? "no-store, no-cache, must-revalidate"
      : "public, max-age=86400, s-maxage=86400",
  };

  const imageVersion = getOgImageVersion();
  if (!preview) {
    const cached = await readOgImageKv(c.env.MOMENT_CACHE, section, total, imageVersion);
    if (cached) {
      return new Response(cached, { headers: pngHeaders });
    }
  }

  const images = (
    await Promise.all(
      urls.map(async (url) => {
        const photoId = url.match(/^\/api\/photos\/([^/]+)\/thumb$/);
        const response = photoId
          ? await photoImage(c.env, photoId[1], "thumb")
          : await c.env.ASSETS.fetch(new Request(new URL(url, c.req.url)));
        return response && response.ok
          ? `data:${photoId ? "image/jpeg" : mimeType(url)};base64,${arrayBufferToBase64(await response.arrayBuffer())}`
          : null;
      }),
    )
  ).filter((image) => image !== null);

  let dots: OgDot[] = [];
  if (section === "atlas") {
    const zoom = 1.15;
    const center: [number, number] = [58.5, 44];
    const map = await fetch(
      `https://api.mapbox.com/styles/v1/mapbox/light-v10/static/${center[0]},${center[1]},${zoom},0/500x500@2x?access_token=${MAPBOX_TOKEN}&logo=false&attribution=false`,
      { headers: { Referer: `${SITE_ORIGIN}/` } },
    );
    if (map.ok) {
      images.push(`data:image/png;base64,${arrayBufferToBase64(await map.arrayBuffer())}`);
      const world = 512 * 2 ** zoom;
      const [[cx, cy], ...points] = [
        { coords: center, color: "" },
        ...groups
          .filter((group) => DEFAULT_GROUPS.includes(group.label))
          .flatMap((group) =>
            group.places.map((place) => ({ coords: place.coords, color: group.color })),
          ),
      ].map(({ coords: [lng, lat], color }): [number, number, string] => {
        const sin = Math.sin((lat * Math.PI) / 180);
        return [
          ((lng + 180) / 360) * world,
          (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world,
          color,
        ];
      });
      dots = points.map(([x, y, color]) => ({ x: x - cx + 250, y: y - cy + 250, color }));
    }
  }

  const logo = await c.env.ASSETS.fetch(new Request(new URL("/favicon.png", c.req.url)));
  const svg = renderOgImage({
    title,
    subtitle,
    logo: `data:image/png;base64,${arrayBufferToBase64(await logo.arrayBuffer())}`,
    images,
    dots,
  });
  const png = await renderOgPng(svg, c.env.MOMENT_CACHE);
  if (!preview) {
    await writeOgImageKv(c.env.MOMENT_CACHE, section, total, imageVersion, png);
  }
  return new Response(png, { headers: pngHeaders });
});

app.get("/api/photos/:id/:size{original|thumb}", async (c) => {
  const size = c.req.param("size") === "thumb" ? "thumb" : "original";
  const image = await photoImage(c.env, c.req.param("id"), size);
  if (!image || !image.body) return c.notFound();
  return new Response(image.body, {
    headers: {
      "content-type": image.headers.get("content-type") || "image/jpeg",
      "cache-control": "public, max-age=86400",
    },
  });
});

app.get("/api/profile", async (c) => c.json({ profile: await readProfile(c.env) }));

app.get("/api/vesper/connect", async (c) =>
  c.redirect(await authorize(c.env, new URL("/api/vesper/callback", c.req.url).toString())),
);

app.get("/api/vesper/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.text(c.req.query("error") || "Missing code.", 400);
  await callback(c.env, new URL("/api/vesper/callback", c.req.url).toString(), code, state);
  await c.env.MOMENT_CACHE.delete("vesper:photos");
  return c.redirect("/");
});

app.get("/api/tags", async (c) => {
  return c.json({ tags: await listTagCounts(c.env) });
});

app.get("/api/haul", (c) => c.json({ items: haulItems }));

app.get("/api/haul/:id", (c) => {
  const item = haulItems.find((entry) => entry.id === c.req.param("id"));
  return item ? c.json(item) : c.json({ error: "Not found" }, 404);
});

app.get("/api/wish", (c) => c.json({ items: wishlistItems }));

app.get("/api/wish/:id", (c) => {
  const item = wishlistItems.find((entry) => entry.id === c.req.param("id"));
  return item ? c.json(item) : c.json({ error: "Not found" }, 404);
});

app.get("/api/media", (c) => {
  const kind = mediaKindSchema.safeParse(c.req.query("kind"));
  if (!kind.success) return c.json({ error: "kind must be anime or film" }, 400);
  return c.json({ items: mediaItems.filter((item) => item.kind === kind.data) });
});

app.get("/api/media/:id", (c) => {
  const item = mediaItems.find((entry) => entry.id === c.req.param("id"));
  return item ? c.json(item) : c.json({ error: "Not found" }, 404);
});

app.get("/api/music", async (c) => {
  const playlistId = c.env.SPOTIFY_PLAYLIST_ID;
  if (!playlistId) return c.json({ error: "Spotify playlist is not configured" }, 500);
  try {
    return c.json(await getSpotifyMusic(playlistId));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Spotify unavailable" }, 502);
  }
});

app.get("/api/openapi.json", (c) => c.env.ASSETS.fetch(c.req.raw));

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

function escAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHeadMeta(tags: Record<string, string>): string {
  return Object.entries(tags)
    .map(([k, v]) => {
      if (k === "canonical") {
        return `<link rel="canonical" href="${escAttr(v)}" data-static-head />`;
      }
      if (k.startsWith("og:")) {
        return `<meta property="${k}" content="${escAttr(v)}" data-static-head />`;
      }
      return `<meta name="${k}" content="${escAttr(v)}" data-static-head />`;
    })
    .join("\n    ");
}

app.get("/robots.txt", () => publicResponse(robotsTxt(SITE_ORIGIN), "text/plain; charset=utf-8"));

app.get("/.well-known/api-catalog", (c) =>
  c.json(apiCatalog(SITE_ORIGIN), 200, {
    "Content-Type": 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
    Link: '</.well-known/api-catalog>; rel="api-catalog"',
  }),
);

app.get("/sitemap.xml", (c) =>
  edgeCache(c.req.raw, c.executionCtx, async () =>
    publicResponse(
      sitemapXml(await listRecentPhotos(c.env, DISCOVERY_LIMIT), SITE_ORIGIN),
      "application/xml; charset=utf-8",
    ),
  ),
);

app.get("/rss.xml", (c) =>
  edgeCache(c.req.raw, c.executionCtx, async () =>
    publicResponse(
      rssXml(await listRecentPhotos(c.env, DISCOVERY_LIMIT), SITE_ORIGIN),
      "application/rss+xml; charset=utf-8",
    ),
  ),
);

app.get("/llms.txt", (c) =>
  edgeCache(c.req.raw, c.executionCtx, async () =>
    publicResponse(
      llmsTxt(await listRecentPhotos(c.env, DISCOVERY_LIMIT), SITE_ORIGIN),
      "text/plain; charset=utf-8",
    ),
  ),
);

app.get("/photos/:id{[^/]+}", (c) =>
  c.redirect(photoUrl(new URL(c.req.url).origin, c.req.param("id")), 301),
);

app.get("*", async (c) => {
  if (!c.env.ASSETS) return c.notFound();

  const url = new URL(c.req.url);
  if (
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/assets/") ||
    /\.[a-zA-Z0-9]+$/.test(url.pathname)
  ) {
    return c.env.ASSETS.fetch(c.req.raw);
  }

  const indexUrl = new URL("/", url);
  const htmlRes = await c.env.ASSETS.fetch(
    new Request(indexUrl.toString(), {
      headers: c.req.raw.headers,
      method: "GET",
    }),
  );

  const page = await resolvePageMeta(url, c.env);
  const ogTags: Record<string, string> = {
    description: page.description,
    canonical: page.canonical,
    "og:site_name": SITE_NAME,
    "og:locale": "en_US",
    "og:title": page.title,
    "og:description": page.description,
    "og:url": page.canonical,
    "og:type": page.type ?? "website",
    "twitter:card": "summary_large_image",
    "twitter:title": page.title,
    "twitter:description": page.description,
  };
  if (page.image) {
    ogTags["og:image"] = page.image;
    ogTags["og:image:secure_url"] = page.image;
    if (page.imageType) ogTags["og:image:type"] = page.imageType;
    ogTags["og:image:alt"] = page.title;
    ogTags["twitter:image"] = page.image;
    ogTags["twitter:image:alt"] = page.title;
  }
  if (page.imageWidth) ogTags["og:image:width"] = String(page.imageWidth);
  if (page.imageHeight) ogTags["og:image:height"] = String(page.imageHeight);
  if (page.robots) ogTags.robots = page.robots;

  const injected = [
    buildHeadMeta(ogTags),
    `<link rel="alternate" type="application/rss+xml" title="${SITE_NAME} RSS" href="/rss.xml" data-static-head />`,
    ...(page.jsonLd
      ? [`<script type="application/ld+json" data-static-head>${toJsonLd(page.jsonLd)}</script>`]
      : []),
  ].join("\n    ");
  const fallback = page.fallback;
  const fallbackBody = fallback
    ? [
        "<noscript><main>",
        `<h1>${escAttr(fallback.heading)}</h1>`,
        fallback.imageUrl
          ? `<img src="${escAttr(fallback.imageUrl)}" alt="${escAttr(fallback.heading)}" />`
          : "",
        fallback.text ? `<p>${escAttr(fallback.text)}</p>` : "",
        "<nav>",
        ...Object.values(PUBLIC_PAGE_META).map(
          (item) => `<a href="${escAttr(item.path)}">${escAttr(item.title)}</a>`,
        ),
        "</nav>",
        "</main></noscript>",
      ].join("")
    : "";
  const response = new HTMLRewriter()
    .on("title", {
      element(element) {
        element.setInnerContent(page.title);
        element.setAttribute("data-static-head", "");
      },
    })
    .on("head", {
      element(el) {
        el.append(injected, { html: true });
      },
    })
    .on("body", {
      element(el) {
        if (fallbackBody) el.prepend(fallbackBody, { html: true });
      },
    })
    .transform(htmlRes);
  const headers = new Headers(response.headers);
  if (url.pathname === "/") headers.append("Link", API_LINK_HEADER);
  return new Response(response.body, { status: page.notFound ? 404 : response.status, headers });
});

export default app;
