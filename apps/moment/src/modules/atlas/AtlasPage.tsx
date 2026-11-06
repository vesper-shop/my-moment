import { Show, createMemo, createSignal, lazy, onSettled } from "solid-js";
import { useNavigate, useSearch } from "@tanstack/solid-router";
import { z } from "zod";
import { CalendarDays, MapPin, X } from "lucide-solid";
import { Button, Spinner } from "@my-moment/ui";
import { PageHeader } from "~/components/PageHeader";
import { Segment } from "~/components/Segment";
import { PhotoViewer } from "~/modules/viewer/PhotoViewer";
import { photoItemSchema, type AtlasPoint, type AtlasView, type PhotoItem } from "~/types";
import { Calendar } from "./Calendar";
import { groupMonths } from "./months";
import { DEFAULT_GROUPS, groups } from "./places";

const AtlasMap = lazy(() => import("./AtlasMap").then((module) => ({ default: module.AtlasMap })));

const atlasSchema = z.object({
  photos: z.array(photoItemSchema),
  canUpload: z.boolean(),
});

const VIEW_OPTIONS = [
  { value: "map" as const, label: "Map" },
  { value: "calendar" as const, label: "Calendar" },
];

export function AtlasPage() {
  const search = useSearch({ from: "/atlas" });
  const navigate = useNavigate({ from: "/atlas" });
  const [photos, setPhotos] = createSignal<PhotoItem[]>([]);
  const [canUpload, setCanUpload] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");
  const today = new Date().toLocaleDateString("en-CA");

  onSettled(() => {
    fetch("/api/atlas")
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load the atlas.");
        const atlas = atlasSchema.parse(await response.json());
        setPhotos(atlas.photos);
        setCanUpload(atlas.canUpload);
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Failed to load the atlas."),
      )
      .finally(() => setLoading(false));
  });

  const view = createMemo((): AtlasView => (search().view === "calendar" ? "calendar" : "map"));
  const day = createMemo(() => search().day);
  const months = createMemo(() => groupMonths(photos(), today));
  const days = createMemo(() => new Map(months().flatMap((month) => [...month.days])));
  const located = createMemo(() => photos().filter((photo) => photo.geo));

  const scope = createMemo(() => {
    const selected = day();
    if (!selected) return located();
    const list = days().get(selected);
    if (!list) return [];
    return view() === "map" ? list.filter((photo) => photo.geo) : list;
  });

  const points = createMemo((): AtlasPoint[] =>
    scope().flatMap((photo) =>
      photo.geo
        ? [{ id: photo.id, lng: photo.geo.lng, lat: photo.geo.lat, image: photo.thumbnailUrl }]
        : [],
    ),
  );

  const viewerIndex = () => scope().findIndex((photo) => photo.id === search().photo);

  const show = (next: AtlasView) =>
    void navigate({ search: { view: next, day: day() }, replace: true });

  const openPhoto = (photo: string) =>
    void navigate({
      search: { view: view(), day: day(), photo },
      replace: true,
      resetScroll: false,
    });

  const closePhoto = () =>
    void navigate({
      search: { view: view(), day: day() },
      replace: true,
      resetScroll: false,
    });

  return (
    <main class="flex h-full min-h-0 flex-col">
      <div class="mx-auto w-full max-w-[70rem] shrink-0 px-4 sm:px-8">
        <PageHeader
          title="Atlas"
          subtitle={
            <>
              {photos().length} photo{photos().length !== 1 ? "s" : ""} · {located().length} with a
              location
            </>
          }
          controls={<Segment<AtlasView> options={VIEW_OPTIONS} value={view()} onChange={show} />}
          class="mb-4"
        />
      </div>

      <Show
        when={!error()}
        fallback={<p class="py-16 text-center text-sm text-destructive">{error()}</p>}
      >
        <Show
          when={!loading()}
          fallback={
            <div class="flex items-center justify-center gap-2 py-20 text-muted-foreground">
              <Spinner size="sm" />
              <p class="text-sm">Loading...</p>
            </div>
          }
        >
          <Show
            when={view() === "map"}
            fallback={
              <div class="min-h-0 flex-1 overflow-y-auto">
                <div class="mx-auto max-w-[70rem] px-4 sm:px-8">
                  <Show when={day()}>
                    {(day) => (
                      <div class="sticky top-0 z-10 mx-auto mb-6 flex max-w-xl backdrop-blur-md items-center gap-1 rounded-full border border-border bg-background/85 py-1 pl-3 pr-1 text-xs shadow-sm lg:max-w-none">
                        <span class="font-mono">{day()}</span>
                        <span class="flex-1 text-muted-foreground">
                          · {scope().length} photo{scope().length !== 1 ? "s" : ""}
                        </span>
                        <Show when={scope().some((photo) => photo.geo)}>
                          <Button
                            variant="ghost"
                            size="sm"
                            class="h-7 gap-1.5 rounded-full px-2.5 text-xs"
                            onClick={() => show("map")}
                          >
                            <MapPin size={13} />
                            Show on map
                          </Button>
                        </Show>
                        <Button
                          variant="ghost"
                          size="icon"
                          class="size-7 rounded-full"
                          onClick={() =>
                            void navigate({ search: { view: "calendar" }, replace: true })
                          }
                          aria-label="Clear the selected day"
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    )}
                  </Show>
                  <Calendar
                    months={months()}
                    today={today}
                    selected={day() || null}
                    onOpen={(day) => {
                      const list = days().get(day);
                      if (!list) return;
                      void navigate({
                        search: { view: "calendar", day, photo: list[0].id },
                        replace: true,
                        resetScroll: false,
                      });
                    }}
                  />
                </div>
              </div>
            }
          >
            <div class="relative mx-auto min-h-0 w-full max-w-[70rem] flex-1">
              <AtlasMap
                points={points()}
                groups={groups}
                enabled={DEFAULT_GROUPS}
                onSelect={openPhoto}
              />
              <Show when={day()}>
                {(day) => (
                  <div class="absolute left-3 top-3 z-20 flex items-center gap-1 rounded-full border border-white/20 bg-background/75 py-1 pl-3 pr-1 text-xs shadow-lg backdrop-blur-md">
                    <span class="font-mono">{day()}</span>
                    <span class="text-muted-foreground">· {points().length} on the map</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="size-7 rounded-full"
                      onClick={() => show("calendar")}
                      aria-label="Show this day in the calendar"
                    >
                      <CalendarDays size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="size-7 rounded-full"
                      onClick={() => void navigate({ search: { view: "map" }, replace: true })}
                      aria-label="Show every photo"
                    >
                      <X size={14} />
                    </Button>
                  </div>
                )}
              </Show>
            </div>
          </Show>
        </Show>
      </Show>

      <Show when={viewerIndex() >= 0}>
        <PhotoViewer
          photos={scope()}
          index={viewerIndex()}
          canEdit={canUpload()}
          onClose={closePhoto}
          onIndexChange={(i) => openPhoto(scope()[i].id)}
          onEdit={(photo) => navigate({ to: "/photos/$id/edit", params: { id: photo.id } })}
          onDeleted={(photo) => {
            closePhoto();
            setPhotos((current) => current.filter((item) => item.id !== photo.id));
          }}
        />
      </Show>
    </main>
  );
}
