import { Show, For, Match, Switch, createSignal, createEffect, type Accessor } from "solid-js";
import { Dialog, DialogContent, DialogBody, Button } from "@my-moment/ui";
import { Share2 } from "lucide-solid";
import {} from "@tanstack/solid-router";
import { shareLink } from "~/lib/share";
import { PageHeader } from "~/components/PageHeader";
import { EmptyState } from "~/components/EmptyState";
import { WishCard } from "./WishCard";
import type { WishItem } from "~/types";
import { formatPrice } from "./utils";

interface WishPageProps {
  wishes: Accessor<{ items: WishItem[] }>;
  onRetry: () => void;
  initialOpenItem?: string;
}

export function WishPage(props: WishPageProps) {
  const wishItems = () => props.wishes()?.items;

  const [selectedWish, setSelectedWish] = createSignal<WishItem | null>(null);
  const [showWishDetail, setShowWishDetail] = createSignal(false);

  const shareWishlistLink = () =>
    void shareLink({
      url: `${window.location.origin}/wish`,
      title: "My Wishlist",
    });

  const shareWishLink = (wishId: string, name?: string) =>
    void shareLink({
      url: `${window.location.origin}/wish?item=${wishId}`,
      title: name,
    });

  createEffect(
    () => ({ data: wishItems(), initialOpenItem: props.initialOpenItem }),
    ({ data, initialOpenItem }) => {
      if (!data || !initialOpenItem) return;
      const target = data.find((item) => item.id === initialOpenItem);
      if (target) {
        setSelectedWish(target);
        setShowWishDetail(true);
      }
    },
  );

  return (
    <div>
      <PageHeader
        title="Wishlist"
        actions={
          <>
            <button
              onClick={shareWishlistLink}
              class="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Share wishlist"
            >
              <Share2 size={11} />
            </button>
          </>
        }
        subtitle={
          <Show when={wishItems()}>
            {(data) => (
              <>
                Wishlist · {data().length} item{data().length !== 1 ? "s" : ""} saved
              </>
            )}
          </Show>
        }
      />

      <Switch>
        <Match when={wishItems()}>
          {(data) => (
            <Show
              when={data().length > 0}
              fallback={
                <EmptyState
                  title="No wishes yet"
                  description={"Nothing has been added to this wishlist yet."}
                />
              }
            >
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <For each={data()}>
                  {(item) => (
                    <WishCard
                      item={item}
                      onClick={(i) => {
                        setSelectedWish(i);
                        setShowWishDetail(true);
                      }}
                    />
                  )}
                </For>
              </div>
            </Show>
          )}
        </Match>
      </Switch>

      <Dialog open={showWishDetail()} onOpenChange={setShowWishDetail}>
        <DialogContent onClose={() => setShowWishDetail(false)}>
          <DialogBody>
            <Show when={selectedWish()}>
              {(item) => (
                <>
                  <div class="flex items-center justify-between mb-4">
                    <h2 class="text-lg font-semibold">{item().name}</h2>
                    <div class="flex items-center gap-1 ml-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        class="size-7 text-muted-foreground hover:text-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                        onClick={() => shareWishLink(item().id, item().name)}
                        aria-label="Share wish"
                      >
                        <Share2 size={14} />
                      </Button>
                    </div>
                  </div>
                  <Show when={item().imageUrl}>
                    <div class="mb-4 rounded-lg overflow-hidden border border-border">
                      <img
                        src={item().imageUrl}
                        alt={item().name}
                        class="w-full max-h-60 object-cover"
                      />
                    </div>
                  </Show>
                  <div class="space-y-3">
                    <Show when={item().brand}>
                      <p class="text-sm text-muted-foreground">Brand: {item().brand}</p>
                    </Show>
                    <p class="text-lg font-bold text-primary">{formatPrice(item().price)}</p>
                  </div>
                </>
              )}
            </Show>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
