import { createSignal, createEffect, onSettled, Show } from "solid-js";
import { Portal } from "@solidjs/web";
import {
  ChevronLeft,
  ChevronRight,
  X,
  PanelRightOpen,
  PanelRightClose,
  Share2,
} from "lucide-solid";
import { Button } from "@my-moment/ui";
import { shareLink } from "~/lib/share";
import type { PhotoItem } from "~/types";
import { PhotoDetails } from "./PhotoDetails";

interface PhotoViewerProps {
  photos: PhotoItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}

export function PhotoViewer(props: PhotoViewerProps) {
  const photo = () => props.photos[props.index];
  const [sidebarOpen, setSidebarOpen] = createSignal(true);
  const [loadedUrl, setLoadedUrl] = createSignal("");

  createEffect(
    () => ({ index: props.index, photos: props.photos }),
    ({ index: idx, photos }) => {
      [idx - 1, idx + 1]
        .filter((i) => i >= 0 && i < photos.length)
        .forEach((i) => {
          const img = new Image();
          img.src = photos[i].url;
        });
    },
  );

  const goPrev = () => {
    if (props.index > 0) props.onIndexChange(props.index - 1);
  };
  const goNext = () => {
    if (props.index < props.photos.length - 1) props.onIndexChange(props.index + 1);
  };

  onSettled(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  });

  return (
    <Portal>
      <div class="fixed inset-0 z-50 flex bg-background/95 backdrop-blur-sm">
        <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div class="flex items-center justify-between px-4 py-3">
            <span class="text-sm tabular-nums text-muted-foreground">
              {props.index + 1} / {props.photos.length}
            </span>
            <div class="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                class="size-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() =>
                  void shareLink({
                    url: `${window.location.origin}/?photo=${encodeURIComponent(photo().id)}`,
                    title: photo().title,
                  })
                }
              >
                <Share2 size={15} />
              </Button>
              <Show when={!sidebarOpen()}>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setSidebarOpen(true)}
                >
                  <PanelRightOpen size={16} />
                </Button>
              </Show>
              <Button
                variant="ghost"
                size="icon"
                class="size-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={props.onClose}
              >
                <X size={18} />
              </Button>
            </div>
          </div>

          <div class="flex min-h-0 flex-1 items-center justify-center px-12">
            <Show when={props.index > 0}>
              <Button
                variant="ghost"
                size="icon"
                class="absolute left-4 top-1/2 -translate-y-1/2 size-10 rounded-full bg-card/80 text-muted-foreground backdrop-blur-sm hover:bg-muted hover:text-foreground"
                onClick={goPrev}
              >
                <ChevronLeft size={22} />
              </Button>
            </Show>

            <div class="relative flex h-full w-full items-center justify-center overflow-hidden p-4">
              <img
                src={
                  loadedUrl() === photo().url ? photo().url : photo().thumbnailUrl || photo().url
                }
                alt={photo().title}
                class="h-full w-full object-contain transition-opacity duration-300"
                draggable={false}
                onLoad={() => {
                  const url = photo().url;
                  if (loadedUrl() !== url) {
                    const img = new Image();
                    img.src = url;
                    img.onload = () => setLoadedUrl(url);
                  }
                }}
              />
            </div>

            <Show when={props.index < props.photos.length - 1}>
              <Button
                variant="ghost"
                size="icon"
                class="absolute right-4 top-1/2 -translate-y-1/2 size-10 rounded-full bg-card/80 text-muted-foreground backdrop-blur-sm hover:bg-muted hover:text-foreground"
                onClick={goNext}
              >
                <ChevronRight size={22} />
              </Button>
            </Show>
          </div>
          <details class="group max-h-[42dvh] shrink-0 overflow-auto border-t border-border bg-background/92 lg:hidden">
            <summary class="sticky top-0 flex cursor-pointer list-none items-center justify-between bg-background/95 px-4 py-3 text-sm font-medium backdrop-blur-sm">
              Photo details
              <span class="text-xs font-normal text-muted-foreground group-open:hidden">Open</span>
              <span class="hidden text-xs font-normal text-muted-foreground group-open:inline">
                Close
              </span>
            </summary>
            <PhotoDetails photo={photo()} class="px-4 pb-5" />
          </details>
        </div>

        <div
          class="hidden shrink-0 flex-col border-l border-border bg-background/60 backdrop-blur-sm transition-all duration-300 lg:flex"
          style={{ width: sidebarOpen() ? "20rem" : "0", overflow: "hidden" }}
        >
          <div class="flex h-full w-80 flex-col">
            <div class="flex items-center justify-between border-b border-border px-4 py-3">
              <span class="text-sm text-muted-foreground">Info</span>
              <Button
                variant="ghost"
                size="icon"
                class="size-7 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setSidebarOpen(false)}
              >
                <PanelRightClose size={16} />
              </Button>
            </div>

            <div class="flex-1 overflow-auto p-4">
              <PhotoDetails photo={photo()} />
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
