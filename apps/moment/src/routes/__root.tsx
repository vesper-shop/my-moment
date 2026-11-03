import { createEffect, createSignal, onSettled, Show } from "solid-js";
import { createRootRoute, HeadContent, Link, Outlet, useRouter } from "@tanstack/solid-router";
import { useSession, signIn, signOut } from "~/lib/services/auth";
import {
  Images,
  Map,
  Library,
  MessageCircle,
  ShoppingBag,
  Heart,
  Sun,
  Moon,
  LogIn,
  LogOut,
} from "lucide-solid";
import {
  Avatar,
  Button,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Toaster,
  applyTheme,
} from "@my-moment/ui";
import { GallerySettingsProvider } from "~/providers/gallery-settings-provider";

export const Route = createRootRoute({
  component: RootLayout,
  head: () => ({
    meta: [
      { property: "og:site_name", content: "My Moment" },
      { property: "og:locale", content: "en_US" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const THEME_KEY = "my-moment:theme";

const TABS = [
  { href: "/", label: "Gallery", Icon: Images },
  { href: "/journey", label: "Journey", Icon: Map },
  { href: "/collection", label: "Collection", Icon: Library },
] as const;

const SECONDARY_LINKS = [
  { href: "/messages", label: "Guestbook", Icon: MessageCircle },
  { href: "/haul", label: "Haul", Icon: ShoppingBag },
  { href: "/wish", label: "Wishlist", Icon: Heart },
] as const;

function RootLayout() {
  const session = useSession();
  const router = useRouter();

  const [isDark, setIsDark] = createSignal(false);
  const [themeBtnEl, setThemeBtnEl] = createSignal<HTMLButtonElement | null>(null);

  onSettled(() => {
    const saved = localStorage.getItem(THEME_KEY);
    const dark = saved
      ? saved === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
  });

  const toggleTheme = (btn?: HTMLButtonElement) => {
    const next = !isDark();
    setIsDark(next);
    applyTheme(next, btn ?? themeBtnEl());
    localStorage.setItem(THEME_KEY, next ? "dark" : "light");
  };

  const currentPath = () => router.state.location.pathname ?? "/";
  let initialPath: string | undefined;
  let hasNavigated = false;

  onSettled(() => {
    initialPath = currentPath();
    queueMicrotask(() => {
      const staticElements = document.head.querySelectorAll<HTMLElement>("[data-static-head]");
      staticElements.forEach((element) => {
        const isShadowed = Array.from(document.head.children).some((candidate) => {
          if (candidate === element || candidate.hasAttribute("data-static-head")) return false;
          if (candidate.tagName !== element.tagName) return false;
          if (element.tagName === "TITLE") return true;
          if (element.tagName === "META") {
            return (
              candidate.getAttribute("name") === element.getAttribute("name") &&
              candidate.getAttribute("property") === element.getAttribute("property")
            );
          }
          return (
            element.tagName === "LINK" &&
            candidate.getAttribute("rel") === element.getAttribute("rel")
          );
        });
        if (isShadowed) element.remove();
      });
    });
  });

  createEffect(currentPath, (path) => {
    if (!initialPath) return;
    if (path !== initialPath) hasNavigated = true;
    if (!hasNavigated) return;
    queueMicrotask(() => {
      document.head.querySelectorAll("[data-static-head]").forEach((element) => element.remove());
    });
  });

  const isJourney = () => currentPath() === "/journey" || currentPath().startsWith("/journey/");
  const isMusicView = () => {
    if (currentPath() !== "/collection" && currentPath() !== "/collection/") return false;
    const search = router.state.location.search as Record<string, unknown> | undefined;
    return search?.view === "music";
  };
  const isFullBleed = () => isJourney() || isMusicView();
  const tabIsActive = (href: string) =>
    href === "/"
      ? currentPath() === "/" || currentPath().startsWith("/photos/")
      : currentPath() === href || currentPath().startsWith(`${href}/`);

  const user = () => session()?.data?.user ?? null;

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/";
  };

  const handleSignIn = () => {
    signIn.social({ provider: "you-find-me", callbackURL: currentPath() });
  };

  const AuthDropdown = () => (
    <Popover placement="bottom-end">
      <PopoverTrigger as={"div"} class="inline-flex">
        <Show
          when={user()}
          fallback={
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
              aria-label="Sign in"
            >
              <LogIn size={15} />
            </Button>
          }
        >
          {(u) => (
            <Button
              variant="ghost"
              size="icon"
              class="rounded-full focus-visible:ring-2 focus-visible:ring-accent shrink-0"
            >
              <Avatar src={u().image ?? undefined} fallback={u().name ?? "?"} size="sm" />
            </Button>
          )}
        </Show>
      </PopoverTrigger>
      <PopoverContent class="w-52 p-0">
        <Show
          when={user()}
          fallback={
            <div class="flex flex-col items-center gap-3 py-4 px-4">
              <Avatar size="lg" fallback="?" />
              <p class="text-sm text-muted-foreground">Not signed in</p>
              <Button size="sm" class="w-full gap-2" onClick={handleSignIn}>
                Sign in with you-find.me
              </Button>
            </div>
          }
        >
          {(u) => (
            <div class="flex flex-col items-center gap-3 py-4 px-4">
              <Avatar src={u().image ?? undefined} fallback={u().name ?? "?"} size="lg" />
              <p class="text-center text-sm font-medium">{u().name}</p>
              <Button
                variant="outline"
                size="sm"
                class="w-full gap-2 text-muted-foreground"
                onClick={handleSignOut}
              >
                <LogOut size={13} /> Sign out
              </Button>
            </div>
          )}
        </Show>
        <a
          href="https://github.com/Pleasurecruise/my-moment"
          target="_blank"
          rel="noopener noreferrer"
          class="block border-t border-border px-4 py-2.5 text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Source code
        </a>
      </PopoverContent>
    </Popover>
  );

  return (
    <div
      id="app-scroll-container"
      class="min-h-screen bg-background text-foreground font-sans overflow-x-hidden overflow-y-auto"
    >
      <HeadContent />
      <header class="sticky top-0 z-30 flex items-center justify-between px-4 h-12 bg-background/95 backdrop-blur-sm border-b border-border lg:hidden">
        <div class="flex items-center gap-2">
          <span class="font-serif font-semibold text-foreground tracking-tight">my moment</span>
        </div>
        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            ref={setThemeBtnEl}
            class="h-8 w-8 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
            onClick={(e) => toggleTheme(e.currentTarget)}
            aria-label={isDark() ? "Switch to light mode" : "Switch to dark mode"}
          >
            <Show when={isDark()} fallback={<Moon size={15} />}>
              <Sun size={15} />
            </Show>
          </Button>
          <AuthDropdown />
        </div>
      </header>

      <div
        class={
          isFullBleed()
            ? "flex h-[calc(100dvh-3rem)] flex-col pt-4 lg:h-dvh lg:pt-7"
            : "pb-24 pt-7 max-lg:pt-4"
        }
      >
        <header class="mx-auto hidden w-full max-w-[70rem] px-8 lg:flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-5 pb-4 border-b border-border mb-4">
          <div class="flex flex-col gap-1.5 shrink-0">
            <p class="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            <div class="flex items-baseline gap-3">
              <span class="relative font-serif font-semibold tracking-tight leading-none text-foreground text-[36px]">
                my moment
                <span class="absolute left-0 -bottom-1.75 h-0.75 w-13 rounded-sm bg-accent" />
              </span>
              <span class="font-serif text-sm text-muted-foreground pb-0.5">私の瞬間</span>
            </div>
          </div>

          <div class="flex items-center justify-between gap-2 lg:flex-1 lg:justify-end lg:gap-4">
            <nav
              aria-label="Primary"
              class="flex gap-1 lg:pr-3 lg:mr-1 lg:border-r lg:border-border"
            >
              {TABS.map(({ href, label, Icon }) => {
                const active = tabIsActive(href);
                return (
                  <Link
                    to={href}
                    aria-current={active ? "page" : undefined}
                    class={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      active
                        ? "text-foreground bg-accent/20 font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon size={13} aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                );
              })}
              {SECONDARY_LINKS.map(({ href, label, Icon }) => {
                const active = tabIsActive(href);
                return (
                  <Link
                    to={href}
                    aria-current={active ? "page" : undefined}
                    class={`flex h-8 w-8 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      active
                        ? "text-foreground bg-accent/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                    aria-label={label}
                    title={label}
                  >
                    <Icon size={15} aria-hidden="true" />
                  </Link>
                );
              })}
            </nav>

            <div class="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                ref={setThemeBtnEl}
                class="h-8 w-8 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                onClick={(e) => toggleTheme(e.currentTarget)}
                aria-label={isDark() ? "Switch to light mode" : "Switch to dark mode"}
              >
                <Show when={isDark()} fallback={<Moon size={15} />}>
                  <Sun size={15} />
                </Show>
              </Button>

              <AuthDropdown />
            </div>
          </div>
        </header>

        <nav
          aria-label="Primary"
          class="mx-auto mb-4 flex w-full max-w-[70rem] gap-0.5 px-3 sm:gap-1 sm:px-8 lg:hidden"
        >
          {TABS.map(({ href, label, Icon }) => {
            const active = tabIsActive(href);
            return (
              <Link
                to={href}
                aria-current={active ? "page" : undefined}
                class={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-0 sm:flex-none sm:flex-row sm:px-3 sm:py-2 sm:text-xs ${
                  active
                    ? "text-foreground bg-accent/20 font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Icon size={14} aria-hidden="true" />
                <span class="leading-none">{label}</span>
              </Link>
            );
          })}
          {SECONDARY_LINKS.map(({ href, label, Icon }) => {
            const active = tabIsActive(href);
            return (
              <Link
                to={href}
                aria-current={active ? "page" : undefined}
                class={`flex min-h-12 min-w-0 flex-1 items-center justify-center rounded-md px-1 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-0 sm:flex-none sm:px-2 sm:py-2 ${
                  active
                    ? "text-foreground bg-accent/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
                aria-label={label}
                title={label}
              >
                <Icon size={14} aria-hidden="true" />
              </Link>
            );
          })}
        </nav>

        <div class={isFullBleed() ? "min-h-0 w-full flex-1" : "mx-auto max-w-[70rem] px-4 sm:px-8"}>
          <GallerySettingsProvider>
            <Show when={currentPath()} keyed>
              <Outlet />
            </Show>
          </GallerySettingsProvider>
        </div>

        <Toaster />
      </div>
    </div>
  );
}
