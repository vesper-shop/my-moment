import { z } from "zod";

export interface MessageAuthor {
  name: string;
  image: string | null;
  isHost: boolean;
}

export interface GuestbookMessage {
  id: string;
  parentId: string | null;
  content: string;
  createdAt: string;
  author: MessageAuthor;
  canEdit: boolean;
  canDelete: boolean;
  replies: GuestbookMessage[];
}

export const GUESTBOOK_POST_COOLDOWN_SECONDS = 30;

export interface MessagesResponse {
  messages: GuestbookMessage[];
  total: number;
  nextCursor: string | null;
}

export const guestbookMessageSchema: z.ZodType<GuestbookMessage> = z.lazy(() =>
  z.object({
    id: z.string(),
    parentId: z.string().nullable(),
    content: z.string(),
    createdAt: z.string(),
    author: z.object({
      name: z.string(),
      image: z.string().nullable(),
      isHost: z.boolean(),
    }),
    canEdit: z.boolean(),
    canDelete: z.boolean(),
    replies: z.array(guestbookMessageSchema),
  }),
);

export const messagesResponseSchema: z.ZodType<MessagesResponse> = z.object({
  messages: z.array(guestbookMessageSchema),
  total: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
});

export const messageMutationResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), message: guestbookMessageSchema }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export type MessageMutationResponse = z.infer<typeof messageMutationResponseSchema>;

export interface MessageCursor {
  createdAt: string;
  id: string;
}

interface MessageRowBaseProps {
  message: GuestbookMessage;
  onReply: () => void;
  onUpdated: (message: GuestbookMessage) => void;
  onDelete: () => void;
}

export type MessageRowProps = MessageRowBaseProps &
  (
    | {
        compact: true;
        replyCount?: never;
        repliesExpanded?: never;
        onToggleReplies?: never;
      }
    | {
        compact?: false;
        replyCount: number;
        repliesExpanded: boolean;
        onToggleReplies: () => void;
      }
  );

export interface MessageRecord {
  id: string;
  authorId: string;
  parentId: string | null;
  content: string;
  createdAt: string;
  authorName: string;
  authorImage: string | null;
}

export interface MessageTimestampRecord {
  createdAt: string;
}

export interface MessageCountRecord {
  count: number;
}

export interface MessageOwnerRecord {
  authorId: string;
  isTopLevel: number;
}

export interface MessageOwner {
  authorId: string;
  isTopLevel: boolean;
}

export type CreateMessageResult =
  | { ok: true; message: GuestbookMessage }
  | { ok: false; reason: "rate_limited"; retryAfter: number }
  | { ok: false; reason: "invalid_parent" };
