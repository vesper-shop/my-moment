import { For, Show, onSettled } from "solid-js";
import { MapPin } from "lucide-solid";
import { cn } from "@my-moment/ui";
import { LazyImage } from "~/components/LazyImage";
import type { AtlasMonth } from "~/types";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

interface CalendarProps {
  months: AtlasMonth[];
  today: string;
  selected: string | null;
  onOpen: (day: string) => void;
  onLocate: (day: string) => void;
}

export function Calendar(props: CalendarProps) {
  let root!: HTMLDivElement;

  onSettled(() => {
    if (!props.selected) return;
    const section = root.querySelector(`[data-month="${props.selected.slice(0, 7)}"]`);
    if (section) section.scrollIntoView({ block: "start" });
  });

  return (
    <div
      ref={(element) => {
        root = element;
      }}
      class="grid grid-cols-1 gap-x-8 gap-y-10 pb-10 md:grid-cols-2"
    >
      <For each={props.months}>
        {(entry) => {
          const [year, month] = entry.month.split("-").map(Number);
          const length = new Date(year, month, 0).getDate();
          const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7;
          const days = Array.from(
            { length },
            (_, index) => `${entry.month}-${String(index + 1).padStart(2, "0")}`,
          );
          return (
            <section data-month={entry.month} class="scroll-mt-4">
              <header class="mb-3 flex items-baseline justify-between">
                <h2 class="text-sm font-semibold text-foreground">
                  {new Date(year, month - 1, 1).toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                </h2>
                <span class="font-mono text-[10px] text-muted-foreground">
                  {entry.count} photo{entry.count !== 1 ? "s" : ""}
                </span>
              </header>
              <div class="grid grid-cols-7 gap-1.5">
                <For each={WEEKDAYS}>
                  {(weekday) => (
                    <span class="text-center font-mono text-[10px] text-muted-foreground">
                      {weekday}
                    </span>
                  )}
                </For>
                <For each={Array.from({ length: lead })}>{() => <span />}</For>
                <For each={days}>
                  {(day) => {
                    const photos = entry.days.get(day);
                    const number = Number(day.slice(8));
                    const ring = () =>
                      day === props.selected
                        ? "ring-2 ring-primary"
                        : day === props.today
                          ? "ring-1 ring-ring"
                          : "";
                    return (
                      <Show
                        when={photos}
                        fallback={
                          <div
                            class={cn(
                              "flex aspect-square items-center justify-center rounded-sm bg-muted/40 font-mono text-[10px] text-muted-foreground/60",
                              ring(),
                            )}
                          >
                            {number}
                          </div>
                        }
                      >
                        {(list) => (
                          <div
                            class={cn(
                              "relative aspect-square overflow-hidden rounded-sm bg-muted",
                              ring(),
                            )}
                          >
                            <button
                              type="button"
                              class="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => props.onOpen(day)}
                              aria-label={`${list().length} photo${list().length !== 1 ? "s" : ""} on ${day}`}
                            >
                              <LazyImage
                                src={list()[0].thumbnailUrl}
                                alt={list()[0].title}
                                thumbHash={list()[0].thumbHash}
                                class="size-full"
                              />
                              <span class="absolute left-1 top-0.5 font-mono text-[10px] font-semibold text-white drop-shadow">
                                {number}
                              </span>
                              <Show when={list().length > 1}>
                                <span class="absolute bottom-1 right-1 rounded-full bg-black/55 px-1 font-mono text-[9px] text-white">
                                  {list().length}
                                </span>
                              </Show>
                            </button>
                            <Show when={list().some((photo) => photo.geo)}>
                              <button
                                type="button"
                                class="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-black/45 text-white transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => props.onLocate(day)}
                                aria-label={`Show ${day} on the map`}
                              >
                                <MapPin size={10} />
                              </button>
                            </Show>
                          </div>
                        )}
                      </Show>
                    );
                  }}
                </For>
              </div>
            </section>
          );
        }}
      </For>
    </div>
  );
}
