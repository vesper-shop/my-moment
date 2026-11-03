import { Hono } from "hono";
import { z } from "zod";
import { getSession } from "void/auth";
import { createOwnerGuard, requestIsOwner, type WorkerEnv } from "~/lib/server/access";
import { findOwnerId } from "~/lib/server/owner";
import {
  countPhotos,
  createPhotoFromR2,
  createPhotoFromUpload,
  deletePhoto,
  getPhoto,
  isValidCursor,
  listPhotos,
  listRecentPhotos,
  listTagCounts,
  updatePhoto,
} from "~/lib/server/photos/service";
import { renameTag, deleteTag } from "~/lib/server/photos/repository";
import { photoCreateSchema, photoListQuerySchema } from "~/lib/server/photos/schema";
import { PhotoDomainError } from "~/lib/server/photos/errors";
import type { JsonObject } from "~/types/json";
import {
  countHaul,
  createHaulItem,
  deleteHaulItem,
  getHaulItem,
  listAllHaulItems,
  updateHaulItem,
  uploadHaulImage,
} from "~/lib/server/haul/service";
import {
  convertWishlistItem,
  countWishlist,
  createWishlistItem,
  deleteWishlistItem,
  getWishlistItem,
  listAllWishlistItems,
  updateWishlistItem,
  uploadWishlistImage,
} from "~/lib/server/wishlist/service";
import {
  createMediaItem,
  deleteMediaItem,
  getMediaItem,
  listMediaItems,
  updateMediaItem,
  uploadMediaImage,
} from "~/lib/server/media/service";
import { getSpotifyMusic } from "~/lib/server/spotify";
import { mediaFormSchema, mediaKindSchema } from "~/types/media";
import { goodsFormSchema, wishFormSchema } from "~/types/haul";
import { photoUpdateSchema } from "~/types/photo";
import { renderOgImage, renderOgPhoto, renderOgPng, type OgDot } from "~/lib/server/og";
import { getOgImageVersion, readOgImageKv, writeOgImageKv } from "~/lib/server/og/cache";
import {
  createMessage,
  deleteMessage,
  getMessageOwner,
  listMessages,
  updateMessage,
} from "~/lib/server/messages/repository";
import type { MessageCursor, WorkerBindings } from "~/types";
import { PUBLIC_PAGE_META, SITE_NAME, SITE_ORIGIN, type PublicPageKey } from "~/lib/seo";
import { MAPBOX_TOKEN } from "~/lib/map";
import { DEFAULT_GROUPS, groups } from "~/modules/journey/groups";
import { generateApiKey, getApiKeyStatus, verifyApiKey } from "~/lib/server/apikey";
import { createMomentMcpHandler } from "~/lib/server/mcp";
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
app.onError((error, c) => {
  if (error instanceof PhotoDomainError) {
    return c.json({ error: error.message, code: error.code }, error.httpStatus);
  }
  throw error;
});
const ownerOnly = createOwnerGuard();
const uploadOwnerOnly = createOwnerGuard();

const messageCreateSchema = z.object({
  content: z.string().trim().min(1).max(1000),
  parentId: z.string().uuid().optional(),
});

const messageUpdateSchema = messageCreateSchema.pick({ content: true });

const messageCursorSchema = z.string().transform((value, context): MessageCursor => {
  const separator = value.lastIndexOf("~");
  const createdAt = separator > 0 ? value.slice(0, separator) : "";
  const id = separator > 0 ? value.slice(separator + 1) : "";
  if (Number.isNaN(Date.parse(createdAt)) || !z.string().uuid().safeParse(id).success) {
    context.addIssue({ code: "custom", message: "invalid cursor" });
    return z.NEVER;
  }
  return { createdAt, id };
});

const messageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(20),
  cursor: messageCursorSchema.optional(),
});

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
  const privatePath =
    path === "/upload" ||
    path === "/collection/add" ||
    path.endsWith("/edit") ||
    path === "/haul/add" ||
    path === "/wish/add";

  if (privatePath) {
    return {
      title: `Private workspace — ${SITE_NAME}`,
      description: "A private editing workspace.",
      canonical: absoluteUrl(url.origin, path),
      robots: "noindex, nofollow, noarchive",
    };
  }

  if (path === "/") {
    const photoId = url.searchParams.get("photo");
    const photo = photoId ? await getPhoto(env.DB, photoId) : null;
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
  if (path === "/journey") return staticPageMeta(url.origin, "journey");
  if (path === "/messages" || path === "/snapshot") {
    return staticPageMeta(url.origin, "guestbook");
  }

  if (path === "/haul" || path === "/wish") {
    const view = path === "/wish" ? "wishlist" : "haul";
    const itemId = url.searchParams.get("item");
    if (itemId) {
      const resolved = await (async () => {
        if (view === "wishlist") {
          const item = await getWishlistItem(env.DB, itemId);
          return item
            ? {
                item,
                description: [item.brand, "Saved in the wishlist"].filter(Boolean).join(" · "),
              }
            : null;
        }

        const item = await getHaulItem(env.DB, itemId);
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

app.get("/api/owner", async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({ owner: await requestIsOwner(c) });
});

app.get("/api/settings/api-key", ownerOnly, async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(await getApiKeyStatus(c.env.API_KEY));
});

app.post("/api/settings/api-key", ownerOnly, async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(await generateApiKey(c.env.API_KEY));
});

app.put("/api/settings/api-key", ownerOnly, async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(await generateApiKey(c.env.API_KEY));
});

app.post("/api/mcp", async (c) => {
  if (c.req.header("mcp-session-id")) {
    return c.json({ error: "MCP sessions are not supported." }, 400);
  }
  if (!(await verifyApiKey(c.req.raw, c.env.API_KEY))) {
    c.header("WWW-Authenticate", "Bearer");
    return c.json({ error: "Unauthorized." }, 401);
  }
  const ownerId = await findOwnerId(c.env.DB);
  if (!ownerId) return c.json({ error: "Owner account not found." }, 503);
  return createMomentMcpHandler(c.env, ownerId).fetch(c.req.raw);
});

app.get("/api/messages", async (c) => {
  const query = messageListQuerySchema.safeParse(c.req.query());
  if (!query.success) return c.json({ error: query.error.issues[0]?.message }, 400);
  const session = getSession();
  const result = await listMessages(
    c.env.DB,
    session?.user?.id ?? null,
    await findOwnerId(c.env.DB),
    query.data.cursor ?? null,
    query.data.limit,
  );
  return c.json(result);
});

app.post("/api/messages", async (c) => {
  const session = getSession();
  if (!session?.user) return c.json({ ok: false, error: "Sign in to leave a message" }, 401);
  const parsed = messageCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid message" }, 400);
  }

  const result = await createMessage(
    c.env.DB,
    session.user.id,
    parsed.data.parentId ?? null,
    parsed.data.content,
    await findOwnerId(c.env.DB),
  );
  if (!result.ok) {
    if (result.reason === "rate_limited") {
      c.header("Retry-After", String(result.retryAfter));
      return c.json(
        { ok: false, error: `Please wait ${result.retryAfter}s before posting again` },
        429,
      );
    }
    return c.json({ ok: false, error: "Replies must target a top-level message" }, 400);
  }
  return c.json({ ok: true, message: result.message }, 201);
});

app.patch("/api/messages/:id", async (c) => {
  const session = getSession();
  if (!session?.user) return c.json({ ok: false, error: "Sign in to edit a message" }, 401);
  const parsed = messageUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid message" }, 400);
  }

  const owner = await getMessageOwner(c.env.DB, c.req.param("id"));
  if (!owner) return c.json({ ok: false, error: "Message not found" }, 404);
  if (owner.authorId !== session.user.id) {
    return c.json({ ok: false, error: "You can only edit your own messages" }, 403);
  }

  const message = await updateMessage(
    c.env.DB,
    c.req.param("id"),
    session.user.id,
    parsed.data.content,
    await findOwnerId(c.env.DB),
  );
  if (!message) return c.json({ ok: false, error: "Message not found" }, 404);
  return c.json({ ok: true, message });
});

app.delete("/api/messages/:id", async (c) => {
  const session = getSession();
  if (!session?.user) return c.json({ error: "Unauthorized" }, 401);
  const owner = await getMessageOwner(c.env.DB, c.req.param("id"));
  if (!owner) return c.json({ error: "Message not found" }, 404);
  const isHost = session.user.id === (await findOwnerId(c.env.DB));
  if (owner.authorId !== session.user.id && !isHost) return c.json({ error: "Forbidden" }, 403);
  await deleteMessage(c.env.DB, c.req.param("id"));
  return c.json({ ok: true, deletedReplies: owner.isTopLevel });
});

// First gallery page with the filter panel's tag counts, like memos' page load.
app.get("/api/gallery", async (c) => {
  const query = photoListQuerySchema.safeParse(c.req.query());
  if (!query.success) return c.json({ error: query.error.issues[0]?.message }, 400);
  if (query.data.cursor && !isValidCursor(query.data.cursor)) {
    return c.json({ error: "Invalid cursor." }, 400);
  }

  const [page, tags, total, canUpload] = await Promise.all([
    listPhotos(c.env.DB, query.data),
    listTagCounts(c.env.DB),
    countPhotos(c.env.DB),
    requestIsOwner(c),
  ]);
  return c.json({ ...page, tags, total, canUpload });
});

// Later gallery pages, like memos' GET /api/memos.
app.get("/api/photos", async (c) => {
  const query = photoListQuerySchema.safeParse(c.req.query());
  if (!query.success) return c.json({ error: query.error.issues[0]?.message }, 400);
  if (query.data.cursor && !isValidCursor(query.data.cursor)) {
    return c.json({ error: "Invalid cursor." }, 400);
  }
  return c.json(await listPhotos(c.env.DB, query.data));
});

app.post("/api/photos", ownerOnly, async (c) => {
  const input = photoCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!input.success) return c.json({ error: "Invalid photo payload." }, 400);
  const photo = await createPhotoFromR2(
    c.env.DB,
    c.env.MOMENT_BUCKET,
    c.get("ownerId"),
    input.data,
  );
  return c.json({ photo }, 201);
});

app.post("/api/photos/upload", uploadOwnerOnly, async (c) => {
  const result = await createPhotoFromUpload(
    c.env.DB,
    c.env.MOMENT_BUCKET,
    c.get("ownerId"),
    await c.req.formData(),
  );
  if (!result.ok) return c.json({ error: result.error }, 400);
  return c.json(result.photo);
});

// Photo ids never contain a dot, so stored files such as image1.png reach the R2 route below.
app.get("/api/photos/:id{[^./]+}", async (c) => {
  const id = c.req.param("id");
  const photo = await getPhoto(c.env.DB, id);
  if (!photo) return c.json({ error: "Photo not found" }, 404);
  return c.json({ photo });
});

app.patch("/api/photos/:id", ownerOnly, async (c) => {
  const parsed = photoUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message }, 400);
  }
  if (Object.keys(parsed.data).length === 0) {
    return c.json({ error: "No photo changes provided." }, 400);
  }

  const id = c.req.param("id");
  const photo = await updatePhoto(c.env.DB, id, parsed.data);
  if (!photo) return c.json({ error: "Photo not found" }, 404);
  return c.json({ photo });
});

app.delete("/api/photos/:id", ownerOnly, async (c) => {
  const id = c.req.param("id");
  const deleted = await deletePhoto(c.env.DB, c.env.MOMENT_BUCKET, id);
  if (!deleted) return c.json({ error: "Photo not found" }, 404);
  return c.body(null, 204);
});

app.get("/api/og/photos/:id", async (c) => {
  const photo = await getPhoto(c.env.DB, c.req.param("id"));
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
    const thumbnail = await c.env.MOMENT_BUCKET.get(photo.thumbnailR2Key);
    if (!thumbnail) return c.notFound();
    image = `data:${mimeType(photo.thumbnailUrl)};base64,${arrayBufferToBase64(await thumbnail.arrayBuffer())}`;
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
    total = await countPhotos(c.env.DB);
    title = "Gallery";
    subtitle = count(total, "moment");
    urls = (await listRecentPhotos(c.env.DB, 3)).map((photo) => photo.thumbnailUrl);
  } else if (section === "haul") {
    total = await countHaul(c.env.DB);
    title = "Haul";
    subtitle = count(total, "item");
    urls = (await listAllHaulItems(c.env.DB))
      .flatMap((item) => (item.imageUrl ? [item.imageUrl] : []))
      .slice(0, 3);
  } else if (section === "wishlist") {
    total = await countWishlist(c.env.DB);
    title = "Wishlist";
    subtitle = count(total, "item");
    urls = (await listAllWishlistItems(c.env.DB))
      .flatMap((item) => (item.imageUrl ? [item.imageUrl] : []))
      .slice(0, 3);
  } else if (section === "collection") {
    const [anime, film] = await Promise.all([
      listMediaItems(c.env.DB, "anime"),
      listMediaItems(c.env.DB, "film"),
    ]);
    total = anime.length + film.length;
    title = "Collection";
    subtitle = "Playlists, anime, films, and the things I love";
    urls = [anime, film].flatMap((items) =>
      items.flatMap((item) => (item.imageUrl ? [item.imageUrl] : [])).slice(0, 2),
    );
  } else if (section === "journey") {
    total = 0;
    title = "Journey";
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
        const name = url.replace(/^\/api\/photos\//, "");
        const obj = await c.env.MOMENT_BUCKET.get(name.startsWith("img/") ? name : `img/${name}`);
        return obj
          ? `data:${mimeType(url)};base64,${arrayBufferToBase64(await obj.arrayBuffer())}`
          : null;
      }),
    )
  ).filter((image) => image !== null);

  let dots: OgDot[] = [];
  if (section === "journey") {
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

app.get("/api/photos/*", async (c) => {
  const filename = c.req.path.replace(/^\/api\/photos\//, "");
  if (!filename) return c.notFound();

  const key =
    filename.startsWith("img/thumbnails/") || filename.startsWith("img/")
      ? filename
      : `img/${filename}`;
  const obj = await c.env.MOMENT_BUCKET.get(key);
  if (!obj) return c.notFound();

  const mime = mimeType(filename);

  if (!obj.body) return c.notFound();
  return new Response(obj.body, {
    headers: {
      "content-type": mime,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
});

app.get("/api/tags", async (c) => {
  return c.json({ tags: await listTagCounts(c.env.DB) });
});

app.put("/api/tags/:name", ownerOnly, async (c) => {
  const oldName = decodeURIComponent(c.req.param("name"));
  const parsed = z
    .object({ name: z.string().trim().min(1, "name is required") })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message }, 400);
  }

  const ok = await renameTag(c.env.DB, oldName, parsed.data.name);
  if (!ok) return c.json({ error: "Tag not found or name already exists" }, 404);
  return c.json({ ok: true });
});

app.delete("/api/tags/:name", ownerOnly, async (c) => {
  const name = decodeURIComponent(c.req.param("name"));
  const ok = await deleteTag(c.env.DB, name);
  if (!ok) return c.json({ error: "Tag not found" }, 404);
  return c.json({ ok: true });
});

app.get("/api/haul", async (c) => {
  const items = await listAllHaulItems(c.env.DB);
  return c.json({ items });
});

app.get("/api/haul/:id", async (c) => {
  const id = c.req.param("id");
  const item = await getHaulItem(c.env.DB, id);
  if (!item) return c.json({ error: "Not found" }, 404);
  return c.json(item);
});

app.post("/api/haul", ownerOnly, async (c) => {
  const parsed = goodsFormSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);

  const item = await createHaulItem(c.env.DB, c.get("ownerId"), parsed.data);
  return c.json(item, 201);
});

app.post("/api/haul/upload", ownerOnly, async (c) => {
  const form = await c.req.formData();
  const result = await uploadHaulImage(c.env.MOMENT_BUCKET, form.get("file"));
  if (!result.ok) return c.json({ error: result.error }, 400);
  return c.json({ key: result.key, url: result.url });
});

app.put("/api/haul/:id", ownerOnly, async (c) => {
  const parsed = goodsFormSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);

  const id = c.req.param("id");
  const item = await updateHaulItem(c.env.DB, c.get("ownerId"), id, parsed.data);
  if (!item) return c.json({ error: "Not found" }, 404);
  return c.json(item);
});

app.delete("/api/haul/:id", ownerOnly, async (c) => {
  const id = c.req.param("id");
  const deleted = await deleteHaulItem(c.env.DB, c.env.MOMENT_BUCKET, c.get("ownerId"), id);
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

app.get("/api/wish", async (c) => {
  const items = await listAllWishlistItems(c.env.DB);
  return c.json({ items });
});

app.get("/api/wish/:id", async (c) => {
  const id = c.req.param("id");
  const item = await getWishlistItem(c.env.DB, id);
  if (!item) return c.json({ error: "Not found" }, 404);
  return c.json(item);
});

app.post("/api/wish/upload", ownerOnly, async (c) => {
  const form = await c.req.formData();
  const result = await uploadWishlistImage(c.env.MOMENT_BUCKET, form.get("file"));
  if (!result.ok) return c.json({ error: result.error }, 400);
  return c.json({ key: result.key, url: result.url });
});

app.post("/api/wish", ownerOnly, async (c) => {
  const parsed = wishFormSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);

  const item = await createWishlistItem(c.env.DB, c.get("ownerId"), parsed.data);
  return c.json(item, 201);
});

app.put("/api/wish/:id", ownerOnly, async (c) => {
  const parsed = wishFormSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);

  const id = c.req.param("id");
  const item = await updateWishlistItem(c.env.DB, c.get("ownerId"), id, parsed.data);
  if (!item) return c.json({ error: "Not found" }, 404);
  return c.json(item);
});

app.delete("/api/wish/:id", ownerOnly, async (c) => {
  const id = c.req.param("id");
  const deleted = await deleteWishlistItem(c.env.DB, c.env.MOMENT_BUCKET, c.get("ownerId"), id);
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

app.post("/api/wish/:id/convert", ownerOnly, async (c) => {
  const parsed = goodsFormSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);
  const item = await convertWishlistItem(
    c.env.DB,
    c.get("ownerId"),
    c.req.param("id"),
    parsed.data,
  );
  if (!item) return c.json({ error: "Wish not found" }, 404);
  return c.json(item, 201);
});

app.get("/api/media", async (c) => {
  const kind = mediaKindSchema.safeParse(c.req.query("kind"));
  if (!kind.success) return c.json({ error: "kind must be anime or film" }, 400);
  const items = await listMediaItems(c.env.DB, kind.data);
  return c.json({ items });
});

app.post("/api/media/upload", ownerOnly, async (c) => {
  const form = await c.req.formData();
  const kind = mediaKindSchema.safeParse(form.get("kind"));
  if (!kind.success) return c.json({ error: "kind must be anime or film" }, 400);
  const result = await uploadMediaImage(c.env.MOMENT_BUCKET, kind.data, form.get("file"));
  if (!result.ok) return c.json({ error: result.error }, 400);
  return c.json({ key: result.key, url: result.url });
});

app.get("/api/media/:id", async (c) => {
  const item = await getMediaItem(c.env.DB, c.req.param("id"));
  if (!item) return c.json({ error: "Not found" }, 404);
  return c.json(item);
});

app.post("/api/media", ownerOnly, async (c) => {
  const parsed = mediaFormSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid media" }, 400);
  }
  const item = await createMediaItem(c.env.DB, c.get("ownerId"), parsed.data);
  return c.json(item, 201);
});

app.put("/api/media/:id", ownerOnly, async (c) => {
  const parsed = mediaFormSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid media" }, 400);
  }
  const item = await updateMediaItem(c.env.DB, c.get("ownerId"), c.req.param("id"), parsed.data);
  if (!item) return c.json({ error: "Not found" }, 404);
  return c.json(item);
});

app.delete("/api/media/:id", ownerOnly, async (c) => {
  const deleted = await deleteMediaItem(
    c.env.DB,
    c.env.MOMENT_BUCKET,
    c.get("ownerId"),
    c.req.param("id"),
  );
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
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
      sitemapXml(await listRecentPhotos(c.env.DB, DISCOVERY_LIMIT), SITE_ORIGIN),
      "application/xml; charset=utf-8",
    ),
  ),
);

app.get("/rss.xml", (c) =>
  edgeCache(c.req.raw, c.executionCtx, async () =>
    publicResponse(
      rssXml(await listRecentPhotos(c.env.DB, DISCOVERY_LIMIT), SITE_ORIGIN),
      "application/rss+xml; charset=utf-8",
    ),
  ),
);

app.get("/llms.txt", (c) =>
  edgeCache(c.req.raw, c.executionCtx, async () =>
    publicResponse(
      llmsTxt(await listRecentPhotos(c.env.DB, DISCOVERY_LIMIT), SITE_ORIGIN),
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
