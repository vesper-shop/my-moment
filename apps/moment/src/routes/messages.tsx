import { createFileRoute } from "@tanstack/solid-router";
import { PageHeader } from "~/components/PageHeader";
import { publicPageMeta } from "~/lib/seo";

const GISCUS = {
  "data-repo": "vesper-shop/my-moment",
  "data-repo-id": "R_kgDOSydgSA",
  "data-category": "Announcements",
  "data-category-id": "DIC_kwDOSydgSM4DLR0A",
  "data-mapping": "specific",
  "data-term": "Guestbook",
  "data-strict": "1",
  "data-reactions-enabled": "1",
  "data-emit-metadata": "0",
  "data-input-position": "top",
  "data-theme": "preferred_color_scheme",
  "data-lang": "en",
  "data-loading": "lazy",
};

function mountGiscus(element: HTMLDivElement) {
  const script = document.createElement("script");
  script.src = "https://giscus.app/client.js";
  script.async = true;
  script.crossOrigin = "anonymous";
  for (const [name, value] of Object.entries(GISCUS)) script.setAttribute(name, value);
  element.insertAdjacentElement("beforeend", script);
}

export const Route = createFileRoute("/messages")({
  component: MessagesPage,
  head: () => ({
    meta: publicPageMeta("guestbook"),
  }),
});

function MessagesPage() {
  return (
    <main class="w-full pb-10">
      <PageHeader title="Guestbook" subtitle="Leave a little trace with your GitHub account." />
      <section class="mt-6" aria-label="Guestbook">
        <div ref={mountGiscus} class="giscus" />
      </section>
    </main>
  );
}
