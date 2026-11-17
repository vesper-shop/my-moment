import { createFileRoute, useNavigate, useSearch } from "@tanstack/solid-router";
import { Errored, Loading, Match, Switch, createMemo } from "solid-js";
import { z } from "zod";
import {} from "lucide-solid";
import { Button, Spinner } from "@my-moment/ui";
import { PageHeader } from "~/components/PageHeader";
import { Segment, type SegmentOption } from "~/components/Segment";
import { EmptyState } from "~/components/EmptyState";
import { MusicView, PosterGrid } from "~/modules/collection";
import type { MediaItem } from "~/types";
import { publicPageMeta } from "~/lib/seo";

type CollectionSection = "music" | "anime" | "film";

const SECTION_OPTIONS: SegmentOption<CollectionSection>[] = [
  { value: "anime", label: "Anime" },
  { value: "film", label: "Film" },
  { value: "music", label: "Music" },
];

const collectionSearchSchema = z.object({
  view: z.enum(["music", "anime", "film"]).catch("anime"),
});

export const Route = createFileRoute("/collection/")({
  component: CollectionPage,
  validateSearch: collectionSearchSchema,
  head: () => ({
    meta: publicPageMeta("collection"),
  }),
});

function CollectionPage() {
  const search = useSearch({ from: "/collection/" });
  const navigate = useNavigate({ from: "/collection/" });
  const section = () => search().view;

  const anime = createMemo<{ items: MediaItem[] }>(async () => {
    const response = await fetch("/api/media?kind=anime");
    if (!response.ok) throw new Error("Failed to load anime");
    return response.json();
  });
  const films = createMemo<{ items: MediaItem[] }>(async () => {
    const response = await fetch("/api/media?kind=film");
    if (!response.ok) throw new Error("Failed to load films");
    return response.json();
  });

  const isMusic = () => section() === "music";

  return (
    <main class={isMusic() ? "flex h-full min-h-0 flex-col" : "pb-10"}>
      <div class={isMusic() ? "mx-auto w-full max-w-[70rem] shrink-0 px-4 sm:px-8" : undefined}>
        <PageHeader
          title="Collection"
          class={isMusic() ? "mb-4" : undefined}
          subtitle="Playlists, anime, films, and the things I love."
          controls={
            <Segment<CollectionSection>
              options={SECTION_OPTIONS}
              value={section()}
              onChange={(view) => navigate({ search: { view }, replace: true })}
            />
          }
        />
      </div>

      <div class={isMusic() ? "min-h-0 flex-1" : undefined}>
        <Switch>
          <Match when={isMusic()}>
            <MusicView />
          </Match>
          <Match when={section() === "anime"}>
            <Errored
              fallback={(_, reset) => (
                <EmptyState
                  title="Could not load anime"
                  description="This section is temporarily unavailable."
                  action={
                    <Button variant="link" size="sm" onClick={reset}>
                      Retry
                    </Button>
                  }
                />
              )}
            >
              <Loading
                fallback={
                  <div class="flex items-center justify-center gap-2 py-20 text-muted-foreground">
                    <Spinner size="sm" />
                    <p class="text-sm">Loading...</p>
                  </div>
                }
              >
                <PosterGrid items={anime().items} kind="anime" />
              </Loading>
            </Errored>
          </Match>
          <Match when={section() === "film"}>
            <Errored
              fallback={(_, reset) => (
                <EmptyState
                  title="Could not load films"
                  description="This section is temporarily unavailable."
                  action={
                    <Button variant="link" size="sm" onClick={reset}>
                      Retry
                    </Button>
                  }
                />
              )}
            >
              <Loading
                fallback={
                  <div class="flex items-center justify-center gap-2 py-20 text-muted-foreground">
                    <Spinner size="sm" />
                    <p class="text-sm">Loading...</p>
                  </div>
                }
              >
                <PosterGrid items={films().items} kind="film" />
              </Loading>
            </Errored>
          </Match>
        </Switch>
      </div>
    </main>
  );
}
