import { For, Show, createEffect, createMemo, createSignal, onCleanup, onSettled } from "solid-js";
import mapboxgl from "mapbox-gl";
import MapboxLanguage from "@mapbox/mapbox-gl-language";
import { z } from "zod";
import { Globe2, Images, LocateFixed, Map as MapIcon } from "lucide-solid";
import { Button, Spinner, cn, toast } from "@my-moment/ui";
import { MAPBOX_TOKEN } from "~/lib/map";
import type { AtlasPoint, PlaceGroup } from "~/types";
import "mapbox-gl/dist/mapbox-gl.css";

const PROJECTION_KEY = "my-moment:atlas-projection";
const SOURCE = "photos";
const NEARBY_KM = 30;

const featureSchema = z.object({
  geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z.union([
    z.object({ cluster: z.literal(true), cluster_id: z.number(), point_count: z.number() }),
    z.object({ id: z.string() }),
  ]),
});

interface AtlasMapProps {
  points: AtlasPoint[];
  groups: PlaceGroup[];
  enabled: string[];
  onSelect: (id: string) => void;
}

export function AtlasMap(props: AtlasMapProps) {
  let container!: HTMLDivElement;
  let map: mapboxgl.Map | null = null;
  let observer: MutationObserver | null = null;
  let here: mapboxgl.Marker | null = null;
  let timeout = 0;
  let failure = "";
  const markers = new Map<string, mapboxgl.Marker>();
  const places: { group: string; marker: mapboxgl.Marker }[] = [];
  const images = createMemo(() => new Map(props.points.map((point) => [point.id, point.image])));
  const [enabled, setEnabled] = createSignal(new Set(props.enabled));
  const [photos, setPhotos] = createSignal(true);
  const [projection, setProjection] = createSignal<"globe" | "mercator">("globe");
  const [ready, setReady] = createSignal(false);
  const [error, setError] = createSignal("");
  const [locating, setLocating] = createSignal(false);

  const style = () =>
    document.documentElement.classList.contains("dark")
      ? "mapbox://styles/mapbox/dark-v10"
      : "mapbox://styles/mapbox/light-v10";

  const collection = (points: AtlasPoint[]) => ({
    type: "FeatureCollection",
    features: points.map((point) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [point.lng, point.lat] },
      properties: { id: point.id },
    })),
  });

  const clear = () => {
    for (const marker of markers.values()) marker.remove();
    markers.clear();
  };

  const fit = (points: AtlasPoint[]) => {
    if (!map || points.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds();
    for (const point of points) bounds.extend([point.lng, point.lat]);
    map.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 800 });
  };

  const changeProjection = (next: "globe" | "mercator") => {
    setProjection(next);
    localStorage.setItem(PROJECTION_KEY, next);
    if (map) map.setProjection(next);
  };

  const resize = () => {
    if (map) map.resize();
  };

  createEffect(
    () => props.points,
    (points) => {
      const source = map ? map.getSource<mapboxgl.GeoJSONSource>(SOURCE) : null;
      if (!source) return;
      clear();
      source.setData(collection(points));
      fit(points);
    },
  );

  createEffect(enabled, (current) => {
    for (const place of places) {
      place.marker.getElement().style.display = current.has(place.group) ? "" : "none";
    }
  });

  onSettled(() => {
    const initial = localStorage.getItem(PROJECTION_KEY) === "mercator" ? "mercator" : "globe";
    setProjection(initial);
    mapboxgl.accessToken = MAPBOX_TOKEN;
    try {
      const created = new mapboxgl.Map({
        container,
        style: style(),
        center: [100, 30],
        zoom: 1.5,
        minZoom: 0.7,
        projection: initial,
        attributionControl: false,
      });
      map = created;
      created.addControl(new MapboxLanguage({ defaultLanguage: "en" }));
      created.on("error", (event) => {
        if (/events\.mapbox\.com|telemetry|ERR_BLOCKED_BY_CLIENT/i.test(event.error.message))
          return;
        failure = event.error.message;
      });
      timeout = window.setTimeout(() => {
        if (!ready()) {
          setError(
            failure ||
              "The map style did not finish loading. Check Mapbox access and WebGL support.",
          );
        }
      }, 15_000);
      created.on("style.load", () => {
        clear();
        created.setProjection(projection());
        if (projection() === "globe") {
          created.setFog({
            color: "rgba(0,0,0,0)",
            "high-color": "rgba(255,255,255,0.1)",
            "space-color": "rgba(0,0,0,0)",
            "horizon-blend": 0,
          });
        }
        created.addSource(SOURCE, {
          type: "geojson",
          data: collection(props.points),
          cluster: true,
          clusterRadius: 56,
          clusterMaxZoom: 15,
        });
        created.addLayer({
          id: SOURCE,
          type: "circle",
          source: SOURCE,
          paint: { "circle-radius": 0, "circle-opacity": 0 },
        });
      });
      created.on("load", () => {
        window.clearTimeout(timeout);
        setReady(true);
        created.resize();
        const popup = new mapboxgl.Popup({
          offset: 10,
          closeButton: false,
          closeOnClick: false,
          focusAfterOpen: false,
        });
        for (const group of props.groups) {
          for (const place of group.places) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = `atlas-place${place.current ? " is-current" : ""}`;
            button.style.display = enabled().has(group.label) ? "" : "none";
            button.style.setProperty("--marker-color", group.color);
            button.style.setProperty(
              "--marker-size",
              `${place.current ? 16 : Math.max(10, place.size * 120)}px`,
            );
            button.setAttribute("aria-label", `${place.label}, ${group.label}`);
            const dot = document.createElement("span");
            dot.className = "atlas-place-dot";
            button.appendChild(dot);
            const [lng, lat] = place.coords;
            const show = () => {
              const nearby = props.points.filter(
                (point) =>
                  Math.hypot((point.lng - lng) * Math.cos((lat * Math.PI) / 180), point.lat - lat) *
                    111 <
                  NEARBY_KM,
              ).length;
              popup
                .setLngLat(place.coords)
                .setText(
                  `${place.label} · ${nearby === 0 ? group.label : `${nearby} photo${nearby === 1 ? "" : "s"}`}`,
                )
                .addTo(created);
            };
            button.addEventListener("mouseenter", show);
            button.addEventListener("mouseleave", () => popup.remove());
            button.addEventListener("click", (event) => {
              event.stopPropagation();
              show();
              created.flyTo({ center: place.coords, zoom: 11, essential: true });
            });
            places.push({
              group: group.label,
              marker: new mapboxgl.Marker({ element: button })
                .setLngLat(place.coords)
                .addTo(created),
            });
          }
        }
        created.on("click", () => popup.remove());
        fit(props.points);
      });
      created.on("render", () => {
        if (!created.getSource(SOURCE) || !created.isSourceLoaded(SOURCE)) return;
        const seen = new Set<string>();
        for (const feature of created.querySourceFeatures(SOURCE)) {
          const parsed = featureSchema.safeParse(feature.toJSON());
          if (!parsed.success) continue;
          const value = parsed.data.properties;
          const key = "cluster" in value ? `cluster:${value.cluster_id}` : `photo:${value.id}`;
          seen.add(key);
          if (markers.has(key)) continue;
          const [lng, lat] = parsed.data.geometry.coordinates;
          const element = document.createElement("button");
          element.type = "button";
          if ("cluster" in value) {
            element.className = "atlas-cluster";
            element.textContent = String(value.point_count);
            element.setAttribute("aria-label", `${value.point_count} photos`);
            element.addEventListener("click", () => {
              const source = created.getSource<mapboxgl.GeoJSONSource>(SOURCE);
              if (!source) return;
              source.getClusterExpansionZoom(value.cluster_id, (reason, zoom) => {
                if (reason || typeof zoom !== "number") return;
                created.easeTo({ center: [lng, lat], zoom });
              });
            });
          } else {
            const image = images().get(value.id);
            if (!image) continue;
            element.className = "atlas-pin";
            element.setAttribute("aria-label", "Open photo");
            const thumbnail = document.createElement("img");
            thumbnail.src = image;
            thumbnail.alt = "";
            thumbnail.loading = "lazy";
            element.appendChild(thumbnail);
            element.addEventListener("click", () => props.onSelect(value.id));
          }
          markers.set(key, new mapboxgl.Marker({ element }).setLngLat([lng, lat]).addTo(created));
        }
        for (const [key, marker] of markers) {
          if (seen.has(key)) continue;
          marker.remove();
          markers.delete(key);
        }
      });
      window.addEventListener("resize", resize);
      observer = new MutationObserver(() =>
        created.setStyle(style(), {
          diff: false,
          localFontFamily: "",
          localIdeographFontFamily: "sans-serif",
        }),
      );
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The map failed to start.");
    }
  });

  onCleanup(() => {
    window.clearTimeout(timeout);
    window.removeEventListener("resize", resize);
    if (observer) observer.disconnect();
    if (here) here.remove();
    clear();
    for (const place of places) place.marker.remove();
    places.length = 0;
    if (map) map.remove();
    map = null;
  });

  return (
    <section
      class="atlas-shell relative h-full w-full overflow-hidden border-y border-border bg-muted/30"
      data-photos={photos() ? "on" : "off"}
    >
      <div
        ref={(element) => {
          container = element;
        }}
        class="h-full w-full"
        aria-label="Photo map"
      />

      <Show when={!ready() && !error()}>
        <div class="pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-lg border border-border bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-md backdrop-blur-md">
          <Spinner size="sm" /> Loading map…
        </div>
      </Show>
      <Show when={error()}>
        <div class="pointer-events-none absolute bottom-3 left-3 z-20 max-w-sm rounded-lg border border-destructive/30 bg-background/90 px-3 py-2 text-xs text-destructive shadow-md backdrop-blur-md">
          {error()}
        </div>
      </Show>

      <div class="absolute bottom-6 right-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-col items-end gap-2 sm:right-6">
        <div class="flex gap-2">
          <div class="inline-flex rounded-full border border-white/20 bg-background/75 p-1 shadow-lg backdrop-blur-md">
            <Button
              variant="ghost"
              size="icon"
              class={cn("size-8 rounded-full", projection() !== "globe" && "opacity-35")}
              onClick={() => changeProjection("globe")}
              aria-label="Globe projection"
            >
              <Globe2 size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class={cn("size-8 rounded-full", projection() !== "mercator" && "opacity-35")}
              onClick={() => changeProjection("mercator")}
              aria-label="Flat map projection"
            >
              <MapIcon size={16} />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="size-10 rounded-full border border-white/20 bg-background/75 shadow-lg backdrop-blur-md"
            onClick={() => {
              setLocating(true);
              navigator.geolocation.getCurrentPosition(
                ({ coords }) => {
                  setLocating(false);
                  if (!map) return;
                  if (here) here.remove();
                  const dot = document.createElement("div");
                  dot.className = "atlas-here";
                  dot.setAttribute("aria-label", "Your current location");
                  here = new mapboxgl.Marker({ element: dot })
                    .setLngLat([coords.longitude, coords.latitude])
                    .addTo(map);
                  map.flyTo({
                    center: [coords.longitude, coords.latitude],
                    zoom: 10,
                    essential: true,
                  });
                },
                (reason) => {
                  setLocating(false);
                  toast.error(
                    reason.code === reason.PERMISSION_DENIED
                      ? "Location permission was denied."
                      : "Your location could not be determined.",
                  );
                },
                { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
              );
            }}
            disabled={locating() || !ready()}
            aria-label="Locate me"
          >
            <Show when={!locating()} fallback={<Spinner size="sm" />}>
              <LocateFixed size={17} />
            </Show>
          </Button>
        </div>
        <div class="flex max-w-full items-center gap-3 overflow-x-auto rounded-full border border-white/20 bg-background/75 px-3 py-2 text-xs shadow-lg backdrop-blur-md">
          <button
            type="button"
            aria-pressed={photos() ? "true" : "false"}
            onClick={() => setPhotos(!photos())}
            class={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-opacity",
              !photos() && "opacity-30",
            )}
          >
            <Images size={12} />
            Photos
          </button>
          <For each={props.groups}>
            {(group) => (
              <button
                type="button"
                aria-pressed={enabled().has(group.label) ? "true" : "false"}
                onClick={() =>
                  setEnabled((current) => {
                    const next = new Set(current);
                    if (next.has(group.label)) next.delete(group.label);
                    else next.add(group.label);
                    return next;
                  })
                }
                class={cn(
                  "flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-opacity",
                  !enabled().has(group.label) && "opacity-30",
                )}
              >
                <span
                  class="size-2.5 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(17,24,39,0.08)] dark:shadow-[0_0_0_2px_rgba(255,255,255,0.19)]"
                  style={{ background: group.color }}
                />
                {group.label}
              </button>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
