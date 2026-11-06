import { createFileRoute } from "@tanstack/solid-router";
import { z } from "zod";
import { publicPageMeta } from "~/lib/seo";
import { AtlasPage } from "~/modules/atlas/AtlasPage";

export const Route = createFileRoute("/atlas")({
  validateSearch: z.object({
    view: z.enum(["map", "calendar"]).optional(),
    day: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
    photo: z.string().optional(),
  }),
  component: AtlasPage,
  head: () => ({
    meta: publicPageMeta("atlas"),
  }),
});
