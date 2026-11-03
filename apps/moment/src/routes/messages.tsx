import { createFileRoute } from "@tanstack/solid-router";
import { For, Show, createEffect, createSignal, onCleanup, onSettled } from "solid-js";
import type { JSX } from "@solidjs/web";
import { ChevronDown, CornerDownRight, Pencil, Plus, Reply, Send, Trash2 } from "lucide-solid";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Avatar,
  Badge,
  Button,
  Spinner,
  Textarea,
  toast,
} from "@my-moment/ui";
import { signIn, useSession } from "~/lib/services/auth";
import { PageHeader } from "~/components/PageHeader";
import { EmptyState } from "~/components/EmptyState";
import { EmojiPicker } from "~/components/EmojiPicker";
import { IMAGE_EMOJIS } from "~/lib/emojis";
import { splitTextLinks } from "~/lib/text";
import {
  GUESTBOOK_POST_COOLDOWN_SECONDS,
  messageMutationResponseSchema,
  messagesResponseSchema,
} from "~/types/messages";
import type { GuestbookMessage, MessageRowProps } from "~/types/messages";
import { publicPageMeta } from "~/lib/seo";

export const Route = createFileRoute("/messages")({
  component: MessagesPage,
  head: () => ({
    meta: publicPageMeta("guestbook"),
  }),
});

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d ago`;
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function MessagesPage() {
  const session = useSession();
  const user = () => session()?.data?.user ?? null;
  const [messages, setMessages] = createSignal<GuestbookMessage[]>([]);
  const [total, setTotal] = createSignal(0);
  const [cursor, setCursor] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [error, setError] = createSignal("");
  const [content, setContent] = createSignal("");
  const [composerOpen, setComposerOpen] = createSignal(false);
  const [replyingTo, setReplyingTo] = createSignal<GuestbookMessage | null>(null);
  const [expandedReplies, setExpandedReplies] = createSignal(new Set<string>());
  const [submitting, setSubmitting] = createSignal(false);
  const [deleteTarget, setDeleteTarget] = createSignal<{
    message: GuestbookMessage;
    topLevel: boolean;
  } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const [loadMoreElement, setLoadMoreElement] = createSignal<HTMLDivElement>();
  let composerTextarea: HTMLTextAreaElement | undefined;

  const load = async (append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ limit: "20" });
      if (append && cursor()) query.set("cursor", cursor()!);
      const response = await fetch(`/api/messages?${query}`);
      if (!response.ok) throw new Error("The guestbook is unavailable.");
      const data = messagesResponseSchema.parse(await response.json());
      setMessages((current) => (append ? [...current, ...data.messages] : data.messages));
      setTotal(data.total);
      setCursor(data.nextCursor);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Something went wrong.";
      if (append) toast.error(message);
      else setError(message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  let infiniteScrollObserver: IntersectionObserver | undefined;
  const observeLoadMore = (element: HTMLDivElement) => {
    infiniteScrollObserver?.disconnect();
    if (!("IntersectionObserver" in window)) return;
    infiniteScrollObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && cursor() && !loading() && !loadingMore()) void load(true);
      },
      { rootMargin: "400px 0px" },
    );
    infiniteScrollObserver.observe(element);
  };

  onSettled(() => void load());
  onCleanup(() => infiniteScrollObserver?.disconnect());
  createEffect(
    () => ({ element: loadMoreElement(), nextCursor: cursor() }),
    ({ element, nextCursor }) => {
      infiniteScrollObserver?.disconnect();
      if (element && nextCursor) observeLoadMore(element);
    },
  );
  createEffect(
    () => user()?.id ?? null,
    () => void load(),
    { defer: true },
  );

  const startSignIn = () => signIn.social({ provider: "you-find-me", callbackURL: "/messages" });

  const openComposer = () => {
    if (!user()) return startSignIn();
    setComposerOpen(true);
    requestAnimationFrame(() => {
      const composer = document.querySelector<HTMLFormElement>("#message-composer");
      composer?.scrollIntoView({ behavior: "smooth", block: "center" });
      composer?.querySelector("textarea")?.focus({ preventScroll: true });
    });
  };

  const toggleComposer = () => {
    if (!user()) return startSignIn();
    if (composerOpen()) {
      setComposerOpen(false);
      setReplyingTo(null);
      return;
    }
    openComposer();
  };

  const startReply = (message: GuestbookMessage) => {
    if (!user()) return startSignIn();
    setReplyingTo(message);
    setContent("");
    openComposer();
  };

  const insertEmoji = (value: string) => {
    const current = content();
    const start = composerTextarea?.selectionStart ?? current.length;
    const end = composerTextarea?.selectionEnd ?? start;
    const next = `${current.slice(0, start)}${value}${current.slice(end)}`;
    if (next.length > 1000) return;
    setContent(next);
    requestAnimationFrame(() => {
      composerTextarea?.focus();
      composerTextarea?.setSelectionRange(start + value.length, start + value.length);
    });
  };

  const toggleReplies = (id: string) => {
    setExpandedReplies((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async (event: Event) => {
    event.preventDefault();
    if (!user()) return startSignIn();
    const text = content().trim();
    if (!text || text.length > 1000) return;
    setSubmitting(true);
    try {
      const parent = replyingTo();
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, parentId: parent?.id }),
      });
      const data = messageMutationResponseSchema.parse(await response.json());
      if (!data.ok) throw new Error(data.error);
      const message = data.message;
      if (parent) {
        setMessages((items) =>
          items.map((item) =>
            item.id === parent.id ? { ...item, replies: [...item.replies, message] } : item,
          ),
        );
        setExpandedReplies((current) => new Set(current).add(parent.id));
      } else {
        setMessages((items) => [message, ...items]);
        setTotal((value) => value + 1);
      }
      setContent("");
      setReplyingTo(null);
      setComposerOpen(false);
      toast.success(parent ? "Reply posted" : "Note posted");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not add your note.");
    } finally {
      setSubmitting(false);
    }
  };

  const requestDelete = (message: GuestbookMessage, topLevel: boolean) => {
    setDeleteTarget({ message, topLevel });
    setDeleteDialogOpen(true);
  };

  const replaceMessage = (updated: GuestbookMessage) => {
    setMessages((items) =>
      items.map((item) => {
        if (item.id === updated.id) return { ...updated, replies: item.replies };
        return {
          ...item,
          replies: item.replies.map((reply) => (reply.id === updated.id ? updated : reply)),
        };
      }),
    );
  };

  const remove = async () => {
    const target = deleteTarget();
    if (!target || deleting()) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/messages/${target.message.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete the note.");
      if (target.topLevel) {
        setMessages((items) => items.filter((item) => item.id !== target.message.id));
        setTotal((value) => Math.max(0, value - 1));
      } else {
        setMessages((items) =>
          items.map((item) => ({
            ...item,
            replies: item.replies.filter((reply) => reply.id !== target.message.id),
          })),
        );
      }
      toast.success(target.topLevel ? "Note and replies deleted" : "Reply deleted");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not delete the note.");
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  return (
    <main class="w-full pb-10">
      <PageHeader
        title="Guestbook"
        actions={
          <button
            type="button"
            onClick={toggleComposer}
            class="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={composerOpen() ? "Close guestbook composer" : "Write in the guestbook"}
            aria-expanded={composerOpen() ? "true" : "false"}
            aria-controls="message-composer"
            title={composerOpen() ? "Close composer" : "Write in the guestbook"}
          >
            <Plus
              size={13}
              class={`transition-transform duration-200 ${composerOpen() ? "rotate-45" : ""}`}
            />
          </button>
        }
        subtitle={
          <>
            {total()} note{total() !== 1 ? "s" : ""} · Leave a little trace.
          </>
        }
      />

      <Show when={composerOpen() ? user() : null}>
        {(currentUser) => (
          <form id="message-composer" onSubmit={submit} class="mb-8 border-y border-border/70 py-3">
            <div class="flex gap-3">
              <Avatar
                src={currentUser().image ?? undefined}
                fallback={currentUser().name}
                size="sm"
              />
              <div class="min-w-0 flex-1">
                <Show when={replyingTo()}>
                  {(target) => (
                    <div class="mb-2 flex items-center justify-between rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
                      <span class="truncate">Replying to {target().author.name}</span>
                      <button
                        type="button"
                        class="hover:text-foreground"
                        onClick={() => setReplyingTo(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </Show>
                <Textarea
                  ref={(element) => (composerTextarea = element)}
                  value={content()}
                  onInput={(event) => setContent(event.currentTarget.value)}
                  placeholder="Write something worth keeping…"
                  rows={3}
                  maxlength={1000}
                  aria-label={
                    replyingTo() ? `Reply to ${replyingTo()!.author.name}` : "Guestbook note"
                  }
                  class="min-h-0 resize-none border-0 bg-transparent px-0 py-1 text-[15px] leading-6 shadow-none focus-visible:ring-0"
                />
                <div class="mt-2 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <EmojiPicker onSelect={insertEmoji} />
                    <span class="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {content().length} / 1000
                    </span>
                    <span class="hidden text-[10px] text-muted-foreground/70 sm:inline">
                      {GUESTBOOK_POST_COOLDOWN_SECONDS}s account cooldown
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="submit"
                    disabled={!content().trim() || submitting()}
                    class="gap-1.5 text-muted-foreground transition-all active:scale-90 hover:text-foreground"
                  >
                    <Show when={!submitting()} fallback={<Spinner size="sm" />}>
                      <Send size={13} />
                    </Show>
                    {replyingTo() ? "Reply" : "Sign"}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        )}
      </Show>

      <Show
        when={!loading()}
        fallback={
          <div class="flex justify-center py-16">
            <Spinner size="sm" />
          </div>
        }
      >
        <Show
          when={!error()}
          fallback={
            <EmptyState
              title="Guestbook unavailable"
              description={error()}
              action={
                <Button variant="link" size="sm" onClick={() => void load()}>
                  Try again
                </Button>
              }
            />
          }
        >
          <Show
            when={messages().length}
            fallback={
              <EmptyState
                title="No notes yet"
                description="Leave the first note and start the conversation."
              />
            }
          >
            <div class="divide-y divide-border/70">
              <For each={messages()}>
                {(message) => (
                  <article class="py-5 first:pt-1">
                    <MessageRow
                      message={message}
                      replyCount={message.replies.length}
                      repliesExpanded={expandedReplies().has(message.id)}
                      onToggleReplies={() => toggleReplies(message.id)}
                      onReply={() => startReply(message)}
                      onUpdated={replaceMessage}
                      onDelete={() => requestDelete(message, true)}
                    />
                    <Show when={expandedReplies().has(message.id) && message.replies.length}>
                      <div class="relative ml-4 mt-4 space-y-4 border-l border-border pl-5 sm:ml-10">
                        <For each={message.replies}>
                          {(reply) => (
                            <div class="relative">
                              <CornerDownRight
                                size={13}
                                class="absolute -left-7 top-1 text-muted-foreground/60"
                              />
                              <MessageRow
                                message={reply}
                                compact
                                onReply={() => startReply(message)}
                                onUpdated={replaceMessage}
                                onDelete={() => requestDelete(reply, false)}
                              />
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </article>
                )}
              </For>
            </div>
            <Show when={cursor()}>
              <div ref={setLoadMoreElement} class="mt-5 flex flex-col items-center gap-2">
                <Button
                  variant="outline"
                  class="w-full"
                  disabled={loadingMore()}
                  onClick={() => void load(true)}
                >
                  <Show
                    when={!loadingMore()}
                    fallback={
                      <>
                        <Spinner size="sm" /> Loading older messages…
                      </>
                    }
                  >
                    Load older notes
                  </Show>
                </Button>
                <p class="text-[10px] text-muted-foreground/70">
                  Older notes load automatically as you scroll.
                </p>
              </div>
            </Show>
          </Show>
        </Show>
      </Show>

      <AlertDialog
        open={deleteDialogOpen()}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open && !deleting()) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              <Show when={deleteTarget()}>
                {(target) => (
                  <Show
                    when={target().topLevel && target().message.replies.length > 0}
                    fallback="This note will be permanently removed. This action cannot be undone."
                  >
                    This note and all {target().message.replies.length} of its replies will be
                    permanently removed. This action cannot be undone.
                  </Show>
                )}
              </Show>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel as={Button} variant="outline" disabled={deleting()}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              as={Button}
              variant="destructive"
              disabled={deleting()}
              onClick={() => void remove()}
            >
              <Show when={!deleting()} fallback={<Spinner size="sm" />}>
                <Trash2 size={14} />
              </Show>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function MessageRow(props: MessageRowProps) {
  const [editing, setEditing] = createSignal(false);
  const [editContent, setEditContent] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const replyControls = () => {
    if (props.compact === true) return null;
    return {
      count: props.replyCount,
      expanded: props.repliesExpanded,
      toggle: props.onToggleReplies,
    };
  };

  const startEdit = () => {
    setEditContent(props.message.content);
    setEditing(true);
  };

  const cancelEdit = () => {
    if (saving()) return;
    setEditing(false);
    setEditContent("");
  };

  const saveEdit = async (event: Event) => {
    event.preventDefault();
    const content = editContent().trim();
    if (!content || content.length > 1000 || saving()) return;
    if (content === props.message.content) return cancelEdit();

    setSaving(true);
    try {
      const response = await fetch(`/api/messages/${props.message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = messageMutationResponseSchema.parse(await response.json());
      if (!data.ok) throw new Error(data.error);
      props.onUpdated(data.message);
      setEditing(false);
      setEditContent("");
      toast.success(props.compact ? "Reply updated" : "Note updated");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not update the note.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="flex gap-3">
      <Avatar
        src={props.message.author.image ?? undefined}
        fallback={props.message.author.name}
        size={props.compact ? "sm" : "default"}
      />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-sm font-semibold">{props.message.author.name}</span>
          <Show when={props.message.author.isHost}>
            <Badge variant="secondary" class="px-1.5 py-0 text-[9px]">
              HOST
            </Badge>
          </Show>
          <time
            class="font-mono text-[10px] text-muted-foreground"
            datetime={props.message.createdAt}
          >
            {relativeTime(props.message.createdAt)}
          </time>
        </div>
        <Show
          when={!editing()}
          fallback={
            <form onSubmit={saveEdit} class="mt-2 rounded-md border border-border bg-muted/20 p-2">
              <Textarea
                value={editContent()}
                onInput={(event) => setEditContent(event.currentTarget.value)}
                rows={props.compact ? 2 : 3}
                maxlength={1000}
                aria-label={props.compact ? "Edit reply" : "Edit guestbook note"}
                class="min-h-0 resize-y border-0 bg-transparent px-1 py-1 text-sm leading-6 shadow-none focus-visible:ring-0"
              />
              <div class="mt-1 flex items-center justify-between gap-3">
                <span class="font-mono text-[9px] tabular-nums text-muted-foreground">
                  {editContent().length} / 1000
                </span>
                <div class="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={saving()}
                    onClick={cancelEdit}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    variant="ghost"
                    disabled={!editContent().trim() || saving()}
                    class="gap-1.5"
                  >
                    <Show when={!saving()} fallback={<Spinner size="sm" />}>
                      <Pencil size={11} />
                    </Show>
                    Save
                  </Button>
                </div>
              </div>
            </form>
          }
        >
          <span class="mt-1.5 block whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">
            {renderGuestbookContent(props.message.content)}
          </span>
          <div
            class={
              props.compact
                ? "mt-2 flex items-center gap-3 text-[11px] text-muted-foreground"
                : "mt-3 flex items-center gap-3 border-t border-border/70 pt-3 text-[11px] text-muted-foreground"
            }
          >
            <Show when={replyControls()}>
              {(controls) => (
                <Show when={controls().count > 0}>
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded px-1.5 py-1 transition-colors hover:bg-muted hover:text-foreground"
                    onClick={controls().toggle}
                    aria-expanded={controls().expanded ? "true" : "false"}
                  >
                    {controls().expanded ? "Hide" : "Show"} replies ({controls().count})
                    <ChevronDown
                      size={12}
                      class={`transition-transform duration-200 ${controls().expanded ? "rotate-180" : ""}`}
                    />
                  </button>
                </Show>
              )}
            </Show>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded px-1.5 py-1 transition-colors hover:bg-muted hover:text-foreground"
              onClick={props.onReply}
            >
              <Reply size={11} /> Reply
            </button>
            <Show when={props.message.canEdit}>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded px-1.5 py-1 transition-colors hover:bg-muted hover:text-foreground"
                onClick={startEdit}
              >
                <Pencil size={11} /> Edit
              </button>
            </Show>
            <Show when={props.message.canDelete}>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded px-1.5 py-1 transition-colors hover:bg-destructive/10 hover:text-destructive"
                onClick={props.onDelete}
              >
                <Trash2 size={11} /> Delete
              </button>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}

function renderGuestbookContent(content: string): JSX.Element {
  return splitTextLinks(content).flatMap((part) =>
    part.type === "link"
      ? [
          <a
            href={part.value}
            target="_blank"
            rel="noopener noreferrer nofollow"
            referrerpolicy="no-referrer"
            class="break-all text-primary underline decoration-primary/35 underline-offset-2 transition-colors hover:decoration-primary"
          >
            {part.value}
          </a>,
        ]
      : renderImageEmojis(part.value),
  );
}

function renderImageEmojis(content: string): JSX.Element[] {
  const parts: JSX.Element[] = [];
  const pattern = /:([a-z0-9]+)_([^:\s]+):/gi;
  let cursor = 0;

  for (const match of content.matchAll(pattern)) {
    const index = match.index;
    if (index > cursor) parts.push(content.slice(cursor, index));
    const emoji = IMAGE_EMOJIS.get(match[0]);
    parts.push(
      emoji ? (
        <img
          src={emoji.value}
          alt={`[${emoji.name}]`}
          title={emoji.name}
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          class={
            emoji.display === "sticker"
              ? "mx-1 inline-block max-h-24 max-w-24 object-contain align-middle"
              : "mx-0.5 inline-block size-8 object-contain align-middle"
          }
        />
      ) : (
        match[0]
      ),
    );
    cursor = index + match[0].length;
  }

  if (cursor < content.length) parts.push(content.slice(cursor));
  return parts;
}
