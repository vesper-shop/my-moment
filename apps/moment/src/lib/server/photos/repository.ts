import { drizzle } from "drizzle-orm/d1";
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  like,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import { photos, tags, photoTags, type PhotoRow } from "../db/schema";
import type { PhotoItem } from "~/types";
import { photoObjectKeyFromUrl } from "./storage";
import { normalizeTags } from "./schema";
import type { PhotoPage, PhotoQuery, TagCount } from "./types";

export type { PhotoItem };

function rowToItem(row: PhotoRow, tagNames: string[]): PhotoItem {
  const r2Key = photoObjectKeyFromUrl(row.url);
  const thumbnailR2Key = photoObjectKeyFromUrl(row.thumbnailUrl);
  if (!r2Key || !thumbnailR2Key) throw new Error("Photo has invalid R2 object URLs");
  return {
    id: row.id,
    url: row.url,
    thumbnailUrl: row.thumbnailUrl,
    r2Key,
    thumbnailR2Key,
    thumbHash: row.thumbHash ?? undefined,
    title: row.title,
    width: row.width,
    height: row.height,
    aspectRatio: row.aspectRatio ?? undefined,
    tags: tagNames,
    date: row.date ?? undefined,
    description: row.description ?? undefined,
    size: row.size ?? undefined,
    format: row.format ?? undefined,
    updatedAt: row.updatedAt,
    geo:
      row.geoLat != null && row.geoLng != null ? { lat: row.geoLat, lng: row.geoLng } : undefined,
  };
}

const CURSOR_SEPARATOR = "|";
// Undated photos sort last in both directions.
const UNDATED_DESC = "";
const UNDATED_ASC = "~";
// Cursor parts are bound as SQL parameters; only their size is constrained.
const MAX_CURSOR_PART = 128;
const tagNamesSchema = z.array(z.string());

/** Each photo's tag names in the same row, so lists never bind one parameter per photo. */
const tagNamesColumn = sql<string[]>`(
  SELECT json_group_array(${tags.name}) FROM ${photoTags}
  INNER JOIN ${tags} ON ${tags.id} = ${photoTags.tagId}
  WHERE ${photoTags.photoId} = "photos"."id"
)`.mapWith((value: string) => tagNamesSchema.parse(JSON.parse(value)));

function encodeCursor(sortValue: string, id: string): string {
  return btoa(encodeURIComponent([sortValue, id].join(CURSOR_SEPARATOR)));
}

function decodeCursor(raw: string): { value: string; id: string } | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw) || raw.length % 4 !== 0) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(atob(raw));
  } catch {
    return null;
  }
  const parts = decoded.split(CURSOR_SEPARATOR);
  if (parts.length !== 2) return null;
  const [value, id] = parts;
  if (value.length > MAX_CURSOR_PART || id.length === 0 || id.length > MAX_CURSOR_PART) return null;
  return { value, id };
}

export function isValidCursor(raw: string): boolean {
  return decodeCursor(raw) !== null;
}

/** Keyset-paginated like memos' listMemos. */
export async function listPhotos(d1: D1Database, query: PhotoQuery): Promise<PhotoPage> {
  const { order, limit } = query;
  const sortValue = sql<string>`coalesce(${photos.date}, ${order === "asc" ? UNDATED_ASC : UNDATED_DESC})`;
  const conditions: SQL[] = [];
  if (query.fromDate) conditions.push(gte(photos.date, query.fromDate));
  if (query.toDate) {
    const nextDay = new Date(Date.parse(`${query.toDate}T00:00:00.000Z`) + 86_400_000);
    conditions.push(lt(photos.date, nextDay.toISOString().slice(0, 10)));
  }
  const tagNames = normalizeTags(query.tags.names);
  if (tagNames.length > 0) {
    const tagged = sql`SELECT ${photoTags.photoId} FROM ${photoTags}
      INNER JOIN ${tags} ON ${tags.id} = ${photoTags.tagId}
      WHERE ${inArray(tags.name, tagNames)}`;
    conditions.push(
      query.tags.mode === "all"
        ? sql`${photos.id} IN (${tagged} GROUP BY ${photoTags.photoId}
            HAVING count(DISTINCT ${tags.name}) = ${tagNames.length})`
        : sql`${photos.id} IN (${tagged})`,
    );
  }
  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(
      sql`(${like(photos.title, pattern)} OR ${like(photos.description, pattern)}
        OR ${photos.id} IN (SELECT ${photoTags.photoId} FROM ${photoTags}
          INNER JOIN ${tags} ON ${tags.id} = ${photoTags.tagId}
          WHERE ${like(tags.name, pattern)}))`,
    );
  }
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    if (!cursor) throw new Error("Invalid photo cursor.");
    conditions.push(
      order === "asc"
        ? sql`(${sortValue}, ${photos.id}) > (${cursor.value}, ${cursor.id})`
        : sql`(${sortValue}, ${photos.id}) < (${cursor.value}, ${cursor.id})`,
    );
  }

  const direction = order === "asc" ? asc : desc;
  const rows = await drizzle(d1)
    .select({ ...getTableColumns(photos), tagNames: tagNamesColumn, sortValue })
    .from(photos)
    .where(and(...conditions))
    .orderBy(direction(sortValue), direction(photos.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    photos: page.map((row) => rowToItem(row, row.tagNames)),
    nextCursor: rows.length > limit && last ? encodeCursor(last.sortValue, last.id) : null,
  };
}

/** Public photos for crawler documents, most recently updated first like memos. */
export async function listRecentPhotos(d1: D1Database, limit: number): Promise<PhotoItem[]> {
  const rows = await drizzle(d1)
    .select({ ...getTableColumns(photos), tagNames: tagNamesColumn })
    .from(photos)
    .orderBy(desc(photos.updatedAt), desc(photos.id))
    .limit(limit);
  return rows.map((row) => rowToItem(row, row.tagNames));
}

export async function listAllPhotos(d1: D1Database): Promise<PhotoItem[]> {
  const rows = await drizzle(d1)
    .select({ ...getTableColumns(photos), tagNames: tagNamesColumn })
    .from(photos)
    .orderBy(desc(photos.date), desc(photos.id));
  return rows.map((row) => rowToItem(row, row.tagNames));
}

export async function countPhotos(d1: D1Database): Promise<number> {
  const [row] = await drizzle(d1).select({ total: count() }).from(photos);
  if (!row) throw new Error("Photo count query returned no row.");
  return row.total;
}

export async function isObjectInUse(d1: D1Database, urls: readonly string[]): Promise<boolean> {
  const [row] = await drizzle(d1)
    .select({ id: photos.id })
    .from(photos)
    .where(or(inArray(photos.url, [...urls]), inArray(photos.thumbnailUrl, [...urls])))
    .limit(1);
  return Boolean(row);
}

export async function getPhoto(d1: D1Database, id: string): Promise<PhotoItem | null> {
  const [row] = await drizzle(d1)
    .select({ ...getTableColumns(photos), tagNames: tagNamesColumn })
    .from(photos)
    .where(eq(photos.id, id))
    .limit(1);
  if (!row) return null;
  return rowToItem(row, row.tagNames);
}

export async function createPhoto(
  d1: D1Database,
  userId: string,
  data: {
    url: string;
    thumbnailUrl: string;
    thumbHash?: string;
    title: string;
    width: number;
    height: number;
    aspectRatio?: number;
    size?: number;
    format?: string;
    date?: string;
    description?: string;
    geo?: { lat: number; lng: number };
    tags: string[];
  },
): Promise<PhotoItem> {
  const db = drizzle(d1);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const r2Key = photoObjectKeyFromUrl(data.url);
  const thumbnailR2Key = photoObjectKeyFromUrl(data.thumbnailUrl);
  if (!r2Key || !thumbnailR2Key) throw new Error("Photo has invalid R2 object URLs");

  await db.insert(photos).values({
    id,
    userId,
    url: data.url,
    thumbnailUrl: data.thumbnailUrl,
    thumbHash: data.thumbHash ?? null,
    title: data.title ?? "",
    description: data.description ?? null,
    width: data.width ?? 0,
    height: data.height ?? 0,
    aspectRatio: data.aspectRatio ?? null,
    size: data.size ?? null,
    format: data.format ?? null,
    date: data.date ?? null,
    geoLat: data.geo?.lat ?? null,
    geoLng: data.geo?.lng ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const tagNames = normalizeTags(data.tags);
  if (tagNames.length > 0) {
    await upsertTagsAndLink(db, id, tagNames);
  }

  return {
    id,
    url: data.url,
    thumbnailUrl: data.thumbnailUrl,
    r2Key,
    thumbnailR2Key,
    thumbHash: data.thumbHash,
    title: data.title,
    width: data.width,
    height: data.height,
    aspectRatio: data.aspectRatio,
    tags: tagNames,
    date: data.date,
    description: data.description,
    size: data.size,
    format: data.format,
    updatedAt: now,
    geo: data.geo,
  };
}

export async function updatePhoto(
  d1: D1Database,
  id: string,
  data: {
    title?: string;
    description?: string;
    tags?: string[];
    date?: string | null;
    geo?: { lat: number; lng: number } | null;
  },
): Promise<PhotoItem | null> {
  const db = drizzle(d1);

  const [existing] = await db.select().from(photos).where(eq(photos.id, id)).limit(1);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.date !== undefined) updates.date = data.date ?? null;
  if (data.geo !== undefined) {
    updates.geoLat = data.geo ? data.geo.lat : null;
    updates.geoLng = data.geo ? data.geo.lng : null;
  }

  await db.update(photos).set(updates).where(eq(photos.id, id));

  // Replace tags if provided
  if (data.tags !== undefined) {
    await db.delete(photoTags).where(eq(photoTags.photoId, id));
    if (data.tags.length > 0) {
      await upsertTagsAndLink(db, id, data.tags);
    }
  }

  return getPhoto(d1, id);
}

export async function deletePhoto(d1: D1Database, id: string): Promise<boolean> {
  const db = drizzle(d1);

  const [existing] = await db
    .select({ id: photos.id })
    .from(photos)
    .where(eq(photos.id, id))
    .limit(1);
  if (!existing) return false;

  // photoTags will cascade delete
  await db.delete(photos).where(eq(photos.id, id));
  return true;
}

// ---- Tag management ----

async function upsertTagsAndLink(
  db: ReturnType<typeof drizzle>,
  photoId: string,
  tagNames: string[],
) {
  const normalized = normalizeTags(tagNames);
  if (normalized.length === 0) return;

  for (const name of normalized) {
    // Upsert tag
    const existing = await db.select().from(tags).where(eq(tags.name, name)).limit(1);
    let tagId: string;

    if (existing.length > 0) {
      tagId = existing[0].id;
    } else {
      tagId = crypto.randomUUID();
      await db.insert(tags).values({ id: tagId, name, createdAt: new Date().toISOString() });
    }

    // Link (ignore if already exists)
    await db.insert(photoTags).values({ photoId, tagId }).onConflictDoNothing();
  }
}

export async function listTagCounts(d1: D1Database): Promise<TagCount[]> {
  const total = sql<number>`count(${photoTags.photoId})`;
  const rows = await drizzle(d1)
    .select({ name: tags.name, count: total })
    .from(tags)
    .innerJoin(photoTags, eq(photoTags.tagId, tags.id))
    .groupBy(tags.name)
    .orderBy(desc(total), asc(tags.name));
  return rows.map((row) => ({ name: row.name, count: Number(row.count) }));
}

export async function renameTag(
  d1: D1Database,
  oldName: string,
  newName: string,
): Promise<boolean> {
  const db = drizzle(d1);
  const normalized = newName.trim().toLowerCase();

  const [existing] = await db.select().from(tags).where(eq(tags.name, oldName)).limit(1);
  if (!existing) return false;

  // Check if new name already exists
  const [conflict] = await db.select().from(tags).where(eq(tags.name, normalized)).limit(1);
  if (conflict) return false;

  await db.update(tags).set({ name: normalized }).where(eq(tags.id, existing.id));
  return true;
}

export async function deleteTag(d1: D1Database, name: string): Promise<boolean> {
  const db = drizzle(d1);

  const [existing] = await db.select().from(tags).where(eq(tags.name, name)).limit(1);
  if (!existing) return false;

  // photoTags will cascade delete
  await db.delete(tags).where(eq(tags.id, existing.id));
  return true;
}
