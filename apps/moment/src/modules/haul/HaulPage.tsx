import {
  Show,
  For,
  Match,
  Switch,
  createSignal,
  createMemo,
  createEffect,
  type Accessor,
} from "solid-js";
import { Dialog, DialogContent, DialogBody, Button } from "@my-moment/ui";
import { SlidersHorizontal, Share2 } from "lucide-solid";
import {} from "@tanstack/solid-router";
import { PageHeader } from "~/components/PageHeader";
import { EmptyState } from "~/components/EmptyState";
import { shareLink } from "~/lib/share";
import { GoodsCard } from "./GoodsCard";
import { FilterBar } from "./FilterBar";
import type { FilterState, GoodsItem, Rating } from "~/types";
import { formatPrice } from "./utils";

interface HaulPageProps {
  haul: Accessor<{ items: GoodsItem[] }>;
  onRetry: () => void;
  initialOpenItem?: string;
}

export function HaulPage(props: HaulPageProps) {
  const items = () => props.haul()?.items;

  const [filter, setFilter] = createSignal<FilterState>({
    search: "",
    categories: [],
    ratings: [],
    sortBy: "newest",
  });
  const [showFilters, setShowFilters] = createSignal(false);

  const [selectedItem, setSelectedItem] = createSignal<GoodsItem | null>(null);
  const [showDetail, setShowDetail] = createSignal(false);

  const filteredItems = createMemo(() => {
    const data = items();
    if (!data) return [];
    let result = [...data];
    const f = filter();
    if (f.search) {
      const q = f.search.toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.brand?.toLowerCase().includes(q) ||
          item.comment.toLowerCase().includes(q),
      );
    }
    if (f.categories.length > 0) {
      result = result.filter((item) => f.categories.includes(item.category));
    }
    if (f.ratings.length > 0) {
      result = result.filter((item) => f.ratings.includes(item.rating));
    }
    const ratingOrder: Record<Rating, number> = {
      worth: 1,
      great: 2,
      amazing: 3,
      godtier: 4,
    };
    switch (f.sortBy) {
      case "newest":
        result.sort(
          (a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime(),
        );
        break;
      case "price-asc":
        result.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        result.sort((a, b) => b.price - a.price);
        break;
      case "rating":
        result.sort((a, b) => ratingOrder[b.rating] - ratingOrder[a.rating]);
        break;
    }
    return result;
  });

  const stats = createMemo(() => {
    const data = items();
    if (!data) return { total: 0, totalSpent: 0 };
    return {
      total: data.length,
      totalSpent: data.reduce((sum, i) => sum + i.price, 0),
    };
  });

  const updateFilter = (partial: Partial<FilterState>) =>
    setFilter((prev) => ({ ...prev, ...partial }));
  const resetFilter = () =>
    setFilter({ search: "", categories: [], ratings: [], sortBy: "newest" });

  const store = {
    items,
    filter,
    filteredItems,
    stats,
    updateFilter,
    resetFilter,
  };

  const shareHaulLink = () =>
    void shareLink({
      url: `${window.location.origin}/haul`,
      title: "My Haul",
    });

  const shareItemLink = (itemId: string, name?: string) =>
    void shareLink({
      url: `${window.location.origin}/haul?item=${itemId}`,
      title: name,
    });

  createEffect(
    () => ({ data: items(), initialOpenItem: props.initialOpenItem }),
    ({ data, initialOpenItem }) => {
      if (!data || !initialOpenItem) return;
      const target = data.find((item) => item.id === initialOpenItem);
      if (target) {
        setSelectedItem(target);
        setShowDetail(true);
      }
    },
  );

  return (
    <div>
      <PageHeader
        title="Haul"
        actions={
          <>
            <button
              onClick={shareHaulLink}
              class="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Share haul"
            >
              <Share2 size={11} />
            </button>
          </>
        }
        subtitle={
          <Show when={items()}>
            {(data) => (
              <>
                Haul · {data().length} item{data().length !== 1 ? "s" : ""}
                <Show when={filteredItems().length !== data().length}>
                  <span class="text-muted-foreground/60"> (filtered from {data().length})</span>
                </Show>
                <Show when={stats().totalSpent > 0}>
                  <span class="text-muted-foreground/60">
                    {" "}
                    · {formatPrice(stats().totalSpent)} total
                  </span>
                </Show>
              </>
            )}
          </Show>
        }
        controls={
          <>
            <Button
              variant={showFilters() ? "default" : "ghost"}
              size="icon"
              class="size-8"
              onClick={() => setShowFilters(!showFilters())}
              aria-label="Toggle filters"
            >
              <SlidersHorizontal size={16} />
            </Button>
          </>
        }
      />

      <Show when={showFilters()}>
        <div class="mb-6">
          <FilterBar store={store} />
        </div>
      </Show>

      <Switch>
        <Match when={items()}>
          {(data) => (
            <>
              <Show
                when={data().length > 0}
                fallback={
                  <EmptyState
                    title="No items yet"
                    description={"Nothing has been added to this collection yet."}
                  />
                }
              >
                <Show
                  when={filteredItems().length > 0}
                  fallback={
                    <EmptyState
                      title="No matching items"
                      description="Try adjusting or resetting the filters."
                    />
                  }
                >
                  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <For each={filteredItems()}>
                      {(item) => (
                        <GoodsCard
                          item={item}
                          onClick={(i) => {
                            setSelectedItem(i);
                            setShowDetail(true);
                          }}
                        />
                      )}
                    </For>
                  </div>
                </Show>
              </Show>
              <Show when={data().length > 0}>
                <div class="h-4" />
              </Show>
            </>
          )}
        </Match>
      </Switch>

      <Dialog open={showDetail()} onOpenChange={setShowDetail}>
        <DialogContent onClose={() => setShowDetail(false)}>
          <DialogBody>
            <Show when={selectedItem()}>
              {(item) => (
                <>
                  <div class="flex items-center justify-between mb-4">
                    <h2 class="text-lg font-semibold">{item().name}</h2>
                    <div class="flex items-center gap-1 ml-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        class="size-7 text-muted-foreground hover:text-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                        onClick={() => shareItemLink(item().id, item().name)}
                        aria-label="Share item"
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
                    <Show when={item().comment}>
                      <blockquote class="pl-4 py-2 border-l-4 border-primary/30 bg-primary/5 rounded-r-lg">
                        <p class="text-sm text-muted-foreground italic">"{item().comment}"</p>
                      </blockquote>
                    </Show>
                    <Show when={item().purchaseLink}>
                      {(() => {
                        const link = item().purchaseLink!;
                        return /^https?:\/\//.test(link) ? (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            Buy again →
                          </a>
                        ) : (
                          <span class="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                            <span class="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                            Delisted
                          </span>
                        );
                      })()}
                    </Show>
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
