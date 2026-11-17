import { createFileRoute } from "@tanstack/solid-router";
import { Show, createEffect, createSignal, onCleanup, onSettled } from "solid-js";
import { z } from "zod";
import { Spinner, toast } from "@my-moment/ui";
import { PhotosRoot } from "~/modules/gallery/PhotosRoot";
import { photoItemSchema, tagCountSchema, type PhotoItem, type TagCount } from "~/types";
import { publicPageMeta } from "~/lib/seo";
import { useGallerySettings } from "~/providers/gallery-settings-provider";

const PAGE_LIMIT = 25;

const TAG_MODES = { union: "any", intersection: "all" } as const;

const photoPageSchema = z.object({
  photos: z.array(photoItemSchema),
  nextCursor: z.string().nullable(),
});

const galleryResponseSchema = photoPageSchema.extend({
  tags: z.array(tagCountSchema),
  total: z.number().int(),
});

export const Route = createFileRoute("/")({
  validateSearch: z.object({
    photo: z.string().optional(),
  }),
  component: HomePage,
  head: () => ({
    meta: publicPageMeta("gallery"),
  }),
  staleTime: 0,
});

function HomePage() {
  const { settings } = useGallerySettings();
  const [photos, setPhotos] = createSignal<PhotoItem[]>([]);
  const [tags, setTags] = createSignal<TagCount[]>([]);
  const [total, setTotal] = createSignal(0);
  const [cursor, setCursor] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [error, setError] = createSignal("");
  const [loadMoreElement, setLoadMoreElement] = createSignal<HTMLDivElement>();
  // Filter changes can overlap; only the latest first-page request may apply.
  let latestRequest = 0;

  const load = async (append = false) => {
    const request = append ? latestRequest : ++latestRequest;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const { selectedTags, sortOrder, tagFilterMode } = settings();
      const query = new URLSearchParams({
        limit: String(PAGE_LIMIT),
        tags: selectedTags.join(","),
        tagMode: TAG_MODES[tagFilterMode],
        order: sortOrder,
      });
      if (append && cursor()) query.set("cursor", cursor()!);
      const response = await fetch(`${append ? "/api/photos" : "/api/gallery"}?${query}`);
      if (!response.ok) throw new Error("Failed to load gallery.");
      if (append) {
        const page = photoPageSchema.parse(await response.json());
        if (request !== latestRequest) return;
        setPhotos((current) => [...current, ...page.photos]);
        setCursor(page.nextCursor);
      } else {
        const gallery = galleryResponseSchema.parse(await response.json());
        if (request !== latestRequest) return;
        setPhotos(gallery.photos);
        setCursor(gallery.nextCursor);
        setTags(gallery.tags);
        setTotal(gallery.total);
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Failed to load gallery.";
      if (append) toast.error(message);
      else setError(message);
    } finally {
      if (request === latestRequest) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  const loadMore = () => {
    if (cursor() && !loading() && !loadingMore()) void load(true);
  };

  let infiniteScrollObserver: IntersectionObserver | null = null;
  onSettled(() => void load());
  onCleanup(() => infiniteScrollObserver?.disconnect());
  createEffect(
    () => ({ element: loadMoreElement(), nextCursor: cursor() }),
    ({ element, nextCursor }) => {
      infiniteScrollObserver?.disconnect();
      if (!element || !nextCursor || !("IntersectionObserver" in window)) return;
      infiniteScrollObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) loadMore();
        },
        { rootMargin: "800px 0px" },
      );
      infiniteScrollObserver.observe(element);
    },
  );
  createEffect(
    () => settings(),
    () => void load(),
    { defer: true },
  );

  return (
    <Show
      when={!error()}
      fallback={<p class="py-16 text-center text-sm text-destructive">{error()}</p>}
    >
      <Show
        when={!loading() || photos().length > 0}
        fallback={
          <div class="flex items-center justify-center gap-2 py-20 text-muted-foreground">
            <Spinner size="sm" />
            <p class="text-sm">Loading...</p>
          </div>
        }
      >
        <PhotosRoot
          photos={photos()}
          tags={tags()}
          total={total()}
          hasMore={cursor() !== null}
          loadingMore={loadingMore()}
          onLoadMore={loadMore}
          loadMoreRef={setLoadMoreElement}
        />
      </Show>
    </Show>
  );
}
