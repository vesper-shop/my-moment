import { For, Show } from "solid-js";
import { MapPin } from "lucide-solid";
import { cn } from "@my-moment/ui";
import { LazyImage } from "~/components/LazyImage";
import type { AtlasMonth } from "~/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface CalendarProps {
  month: AtlasMonth;
  today: string;
  selected: string | null;
  onOpen: (day: string) => void;
  onLocate: (day: string) => void;
}

export function Calendar(props: CalendarProps) {
  const parts = () => props.month.month.split("-").map(Number);
  const lead = () => (new Date(parts()[0], parts()[1] - 1, 1).getDay() + 6) % 7;
  const days = () =>
    Array.from(
      { length: new Date(parts()[0], parts()[1], 0).getDate() },
      (_, offset) => `${props.month.month}-${String(offset + 1).padStart(2, "0")}`,
    );
  const trail = () => (7 - ((lead() + days().length) % 7)) % 7;
  const rows = () => (lead() + days().length + trail()) / 7;

  return (
    <div class="flex flex-col pb-6 sm:min-h-0 sm:flex-1">
      <div class="mb-2 grid shrink-0 grid-cols-7">
        <For each={WEEKDAYS}>
          {(weekday) => (
            <span class="text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
              {weekday}
            </span>
          )}
        </For>
      </div>

      <div class="overflow-hidden rounded-xl border border-border bg-border sm:min-h-0 sm:flex-1">
        <div
          class="grid grid-cols-7 gap-px sm:h-full sm:[grid-template-rows:repeat(var(--rows),minmax(4.5rem,1fr))]"
          style={{ "--rows": String(rows()) }}
        >
          <For each={Array.from({ length: lead() })}>
            {() => <div class="aspect-square bg-muted/30 sm:aspect-auto" />}
          </For>
          <For each={days()}>
            {(day) => {
              const label = day.slice(8);
              const isToday = day === props.today;
              return (
                <Show
                  when={props.month.days.get(day)}
                  fallback={
                    <div
                      class={cn(
                        "relative aspect-square bg-background p-2 sm:aspect-auto sm:p-3",
                        day === props.selected && "ring-2 ring-inset ring-primary",
                      )}
                    >
                      <span
                        class={cn(
                          "font-mono text-[11px] sm:text-sm",
                          isToday ? "font-semibold text-primary" : "text-muted-foreground/50",
                        )}
                      >
                        {label}
                      </span>
                    </div>
                  }
                >
                  {(list) => (
                    <div class="group relative aspect-square overflow-hidden bg-muted sm:aspect-auto">
                      <button
                        type="button"
                        class="absolute inset-0 focus-visible:outline-none"
                        onClick={() => props.onOpen(day)}
                        aria-label={`${list().length} photo${list().length !== 1 ? "s" : ""} on ${day}`}
                      >
                        <LazyImage
                          src={list()[0].thumbnailUrl}
                          alt={list()[0].title}
                          thumbHash={list()[0].thumbHash}
                          class="size-full transition-transform duration-500 ease-out group-hover:scale-105"
                        />
                        <span class="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/45" />
                        <span
                          class={cn(
                            "absolute left-2 top-1.5 font-mono text-[11px] font-semibold drop-shadow sm:left-3 sm:top-2.5 sm:text-sm",
                            isToday ? "text-primary" : "text-white",
                          )}
                        >
                          {label}
                        </span>
                        <Show when={list().length > 1}>
                          <span class="absolute bottom-1.5 right-2 font-mono text-[10px] text-white/90 drop-shadow sm:bottom-2.5 sm:right-3 sm:text-xs">
                            +{list().length - 1}
                          </span>
                        </Show>
                      </button>
                      <Show when={list().some((photo) => photo.geo)}>
                        <button
                          type="button"
                          class="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/60 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100 sm:right-2 sm:top-2 [@media(hover:none)]:opacity-100"
                          onClick={() => props.onLocate(day)}
                          aria-label={`Show ${day} on the map`}
                        >
                          <MapPin size={12} />
                        </button>
                      </Show>
                      <Show when={day === props.selected}>
                        <span class="pointer-events-none absolute inset-0 ring-2 ring-inset ring-primary" />
                      </Show>
                    </div>
                  )}
                </Show>
              );
            }}
          </For>
          <For each={Array.from({ length: trail() })}>
            {() => <div class="aspect-square bg-muted/30 sm:aspect-auto" />}
          </For>
        </div>
      </div>
    </div>
  );
}
