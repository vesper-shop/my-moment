import type {
  CreateMessageResult,
  GuestbookMessage,
  MessageCountRecord,
  MessageCursor,
  MessageOwner,
  MessageOwnerRecord,
  MessageRecord,
  MessagesResponse,
  MessageTimestampRecord,
} from "~/types/messages";
import { GUESTBOOK_POST_COOLDOWN_SECONDS } from "~/types/messages";
import { HOST_DISPLAY_NAME } from "~/lib/identity";

function toMessage(
  row: MessageRecord,
  viewerId: string | null,
  hostId: string | null,
): GuestbookMessage {
  const viewerIsHost = viewerId !== null && viewerId === hostId;
  const authorIsHost = row.authorId === hostId;
  return {
    id: row.id,
    parentId: row.parentId,
    content: row.content,
    createdAt: row.createdAt,
    author: {
      name: authorIsHost ? HOST_DISPLAY_NAME : row.authorName,
      image: row.authorImage,
      isHost: authorIsHost,
    },
    canEdit: row.authorId === viewerId,
    canDelete: row.authorId === viewerId || viewerIsHost,
    replies: [],
  };
}

const SELECT_MESSAGE = `
  SELECT m.id, m."authorId" AS authorId, m."parentId" AS parentId,
         m.content, m."createdAt" AS createdAt,
         u.name AS authorName, u.image AS authorImage
  FROM guestbook_messages m
  JOIN "user" u ON u.id = m."authorId"`;

export async function listMessages(
  db: D1Database,
  viewerId: string | null,
  hostId: string | null,
  cursor: MessageCursor | null,
  limit: number,
): Promise<MessagesResponse> {
  const where = cursor ? `AND (m."createdAt" < ? OR (m."createdAt" = ? AND m.id < ?))` : "";
  const statement = db.prepare(
    `${SELECT_MESSAGE}
     WHERE m."parentId" IS NULL ${where}
     ORDER BY m."createdAt" DESC, m.id DESC
     LIMIT ?`,
  );
  const bound = cursor
    ? statement.bind(cursor.createdAt, cursor.createdAt, cursor.id, limit + 1)
    : statement.bind(limit + 1);
  const { results } = await bound.all<MessageRecord>();
  const hasMore = results.length > limit;
  const topRows = results.slice(0, limit);
  const ids = topRows.map((row) => row.id);

  let replyRows: MessageRecord[] = [];
  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(", ");
    const response = await db
      .prepare(
        `${SELECT_MESSAGE}
         WHERE m."parentId" IN (${placeholders})
         ORDER BY m."createdAt" ASC, m.id ASC`,
      )
      .bind(...ids)
      .all<MessageRecord>();
    replyRows = response.results;
  }

  const replies = new Map<string, GuestbookMessage[]>();
  for (const row of replyRows) {
    if (!row.parentId) continue;
    const list = replies.get(row.parentId) ?? [];
    list.push(toMessage(row, viewerId, hostId));
    replies.set(row.parentId, list);
  }

  const messages = topRows.map((row) => ({
    ...toMessage(row, viewerId, hostId),
    replies: replies.get(row.id) ?? [],
  }));
  const last = topRows.at(-1);
  const count = await db
    .prepare(`SELECT COUNT(*) AS count FROM guestbook_messages WHERE "parentId" IS NULL`)
    .first<MessageCountRecord>();
  if (!count) throw new Error("Message count query returned no row");

  return {
    messages,
    total: Number(count.count),
    nextCursor: hasMore && last ? `${last.createdAt}~${last.id}` : null,
  };
}

export async function getMessage(
  db: D1Database,
  id: string,
  viewerId: string | null,
  hostId: string | null,
): Promise<GuestbookMessage | null> {
  const row = await db.prepare(`${SELECT_MESSAGE} WHERE m.id = ?`).bind(id).first<MessageRecord>();
  return row ? toMessage(row, viewerId, hostId) : null;
}

export async function createMessage(
  db: D1Database,
  authorId: string,
  parentId: string | null,
  content: string,
  hostId: string | null,
): Promise<CreateMessageResult> {
  const latest = await db
    .prepare(
      `SELECT "createdAt" AS createdAt FROM guestbook_messages
       WHERE "authorId" = ? ORDER BY "createdAt" DESC LIMIT 1`,
    )
    .bind(authorId)
    .first<MessageTimestampRecord>();
  if (latest) {
    const elapsed = Date.now() - new Date(latest.createdAt).getTime();
    const cooldownMs = GUESTBOOK_POST_COOLDOWN_SECONDS * 1000;
    if (elapsed < cooldownMs) {
      return {
        ok: false,
        reason: "rate_limited",
        retryAfter: Math.ceil((cooldownMs - elapsed) / 1000),
      };
    }
  }

  if (parentId) {
    const parent = await db
      .prepare(`SELECT id FROM guestbook_messages WHERE id = ? AND "parentId" IS NULL`)
      .bind(parentId)
      .first();
    if (!parent) return { ok: false, reason: "invalid_parent" };
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO guestbook_messages
       (id, "authorId", "parentId", content, "createdAt")
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, authorId, parentId, content, createdAt)
    .run();
  const message = await getMessage(db, id, authorId, hostId);
  if (!message) throw new Error("Created message could not be read");
  return { ok: true, message };
}

export async function updateMessage(
  db: D1Database,
  id: string,
  authorId: string,
  content: string,
  hostId: string | null,
): Promise<GuestbookMessage | null> {
  const result = await db
    .prepare(
      `UPDATE guestbook_messages
       SET content = ?
       WHERE id = ? AND "authorId" = ?`,
    )
    .bind(content, id, authorId)
    .run();
  if (result.meta.changes === 0) return null;
  return getMessage(db, id, authorId, hostId);
}

export async function deleteMessage(db: D1Database, id: string): Promise<boolean> {
  const [, result] = await db.batch([
    db.prepare(`DELETE FROM guestbook_messages WHERE "parentId" = ?`).bind(id),
    db.prepare(`DELETE FROM guestbook_messages WHERE id = ?`).bind(id),
  ]);
  return result.meta.changes > 0;
}

export async function getMessageOwner(db: D1Database, id: string): Promise<MessageOwner | null> {
  const row = await db
    .prepare(
      `SELECT "authorId" AS authorId, "parentId" IS NULL AS isTopLevel
       FROM guestbook_messages WHERE id = ?`,
    )
    .bind(id)
    .first<MessageOwnerRecord>();
  return row ? { authorId: row.authorId, isTopLevel: Boolean(row.isTopLevel) } : null;
}
