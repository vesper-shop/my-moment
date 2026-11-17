import { z } from "zod";
import type { PhotoItem, WorkerBindings } from "~/types";
import { vesperFetch } from "../vesper";
import { normalizeTags } from "./schema";
import type { PhotoPage, PhotoQuery, TagCount } from "./types";

export type { PhotoItem };

const CACHE_KEY = "vesper:photos";
const CACHE_TTL = 300;
const CURSOR_SEPARATOR = "|";
const UNDATED_DESC = "";
const UNDATED_ASC = "~";

const geoSchema = z.object({ lat: z.number(), lng: z.number() }).nullable();
const photoPageSchema = z.object({
  photos: z.array(
    z.object({
      id: z.string(),
      width: z.number(),
      height: z.number(),
      takenAt: z.number().nullable(),
      geo: geoSchema,
      entryId: z.string(),
      caption: z.string(),
      tags: z.array(z.string()),
      occurredAt: z.number(),
      thumbHash: z.string(),
    }),
  ),
  next: z.string().nullable(),
});
const entryPageSchema = z.object({
  entries: z.array(z.object({ id: z.string(), visibility: z.string() })),
  next: z.string().nullable(),
});

const hex = (base64url: string) =>
  Array.from(atob(base64url.replaceAll("-", "+").replaceAll("_", "/")), (char) =>
    char.charCodeAt(0).toString(16).padStart(2, "0"),
  ).join("");

async function collect<T>(
  page: (cursor: string | null) => Promise<{ items: T[]; next: string | null }>,
) {
  const items: T[] = [];
  let cursor: string | null = null;
  do {
    const result = await page(cursor);
    items.push(...result.items);
    cursor = result.next;
  } while (cursor);
  return items;
}

async function fetchPhotos(env: WorkerBindings): Promise<PhotoItem[]> {
  const [publicEntries, photos] = await Promise.all([
    collect(async (cursor) => {
      const query = new URLSearchParams({ in: "all", ...(cursor ? { before: cursor } : {}) });
      const page = entryPageSchema.parse(
        await (await vesperFetch(env, `/api/entries?${query}`)).json(),
      );
      return { items: page.entries, next: page.next };
    }).then(
      (entries) =>
        new Set(entries.filter((entry) => entry.visibility === "public").map((entry) => entry.id)),
    ),
    collect(async (cursor) => {
      const query = cursor ? `?before=${encodeURIComponent(cursor)}` : "";
      const page = photoPageSchema.parse(
        await (await vesperFetch(env, `/api/photos${query}`)).json(),
      );
      return { items: page.photos, next: page.next };
    }),
  ]);
  return photos
    .filter((photo) => publicEntries.has(photo.entryId))
    .map((photo) => {
      const [title = "", ...rest] = photo.caption.split("\n\n");
      const date = new Date(
        photo.takenAt === null ? photo.occurredAt : photo.takenAt,
      ).toISOString();
      return {
        id: photo.id,
        url: `/api/photos/${photo.id}/original`,
        thumbnailUrl: `/api/photos/${photo.id}/thumb`,
        thumbHash: hex(photo.thumbHash),
        title,
        description: rest.length === 0 ? undefined : rest.join("\n\n"),
        width: photo.width,
        height: photo.height,
        aspectRatio: photo.width / photo.height,
        tags: photo.tags,
        date,
        updatedAt: date,
        geo: photo.geo === null ? undefined : photo.geo,
      };
    });
}

export async function loadPhotos(env: WorkerBindings): Promise<PhotoItem[]> {
  const cached = await env.MOMENT_CACHE.get<PhotoItem[]>(CACHE_KEY, "json");
  if (cached) return cached;
  const photos = await fetchPhotos(env);
  await env.MOMENT_CACHE.put(CACHE_KEY, JSON.stringify(photos), { expirationTtl: CACHE_TTL });
  return photos;
}

function encodeCursor(sortValue: string, id: string): string {
  return btoa(encodeURIComponent([sortValue, id].join(CURSOR_SEPARATOR)));
}

function decodeCursor(raw: string): { value: string; id: string } | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw) || raw.length % 4 !== 0) return null;
  const parts = decodeURIComponent(atob(raw)).split(CURSOR_SEPARATOR);
  if (parts.length !== 2 || !parts[1]) return null;
  return { value: parts[0], id: parts[1] };
}

export function isValidCursor(raw: string): boolean {
  return decodeCursor(raw) !== null;
}

export function queryPhotos(photos: PhotoItem[], query: PhotoQuery): PhotoPage {
  const { order, limit } = query;
  const undated = order === "asc" ? UNDATED_ASC : UNDATED_DESC;
  const sortValue = (photo: PhotoItem) => (photo.date === undefined ? undated : photo.date);
  const tagNames = normalizeTags(query.tags.names);
  const search = query.search ? query.search.toLowerCase() : null;
  const nextDay = query.toDate
    ? new Date(Date.parse(`${query.toDate}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10)
    : null;
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (query.cursor && !cursor) throw new Error("Invalid photo cursor.");
  const key = (photo: PhotoItem) => `${sortValue(photo)}${CURSOR_SEPARATOR}${photo.id}`;
  const direction = order === "asc" ? 1 : -1;
  const after = cursor ? `${cursor.value}${CURSOR_SEPARATOR}${cursor.id}` : null;
  const matching = photos
    .filter(
      (photo) => !query.fromDate || (photo.date !== undefined && photo.date >= query.fromDate),
    )
    .filter((photo) => !nextDay || (photo.date !== undefined && photo.date < nextDay))
    .filter((photo) =>
      tagNames.length === 0
        ? true
        : query.tags.mode === "all"
          ? tagNames.every((tag) => photo.tags.includes(tag))
          : tagNames.some((tag) => photo.tags.includes(tag)),
    )
    .filter(
      (photo) =>
        !search ||
        [
          photo.title,
          ...photo.tags,
          ...(photo.description === undefined ? [] : [photo.description]),
        ].some((text) => text.toLowerCase().includes(search)),
    )
    .filter((photo) => !after || (direction === 1 ? key(photo) > after : key(photo) < after))
    .sort((a, b) => (key(a) > key(b) ? direction : -direction));
  const page = matching.slice(0, limit);
  const last = page.at(-1);
  return {
    photos: page,
    nextCursor: matching.length > limit && last ? encodeCursor(sortValue(last), last.id) : null,
  };
}

export async function listPhotos(env: WorkerBindings, query: PhotoQuery): Promise<PhotoPage> {
  return queryPhotos(await loadPhotos(env), query);
}

export async function listRecentPhotos(env: WorkerBindings, limit: number): Promise<PhotoItem[]> {
  return (await loadPhotos(env)).slice(0, limit);
}

export async function countPhotos(env: WorkerBindings): Promise<number> {
  return (await loadPhotos(env)).length;
}

export async function getPhoto(env: WorkerBindings, id: string): Promise<PhotoItem | null> {
  const photo = (await loadPhotos(env)).find((candidate) => candidate.id === id);
  return photo === undefined ? null : photo;
}

export function countTags(photos: PhotoItem[]): TagCount[] {
  return [
    ...Map.groupBy(
      photos.flatMap((photo) => photo.tags),
      (tag) => tag,
    ),
  ]
    .map(([name, uses]) => ({ name, count: uses.length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function listTagCounts(env: WorkerBindings): Promise<TagCount[]> {
  return countTags(await loadPhotos(env));
}

export async function photoImage(env: WorkerBindings, id: string, size: "original" | "thumb") {
  if (!(await getPhoto(env, id))) return null;
  return vesperFetch(env, `/api/photos/${id}?size=${size}`);
}
