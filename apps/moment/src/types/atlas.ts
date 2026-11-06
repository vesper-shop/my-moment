import { z } from "zod";
import type { PhotoItem } from "./photo";

export type AtlasView = "map" | "calendar";

export interface AtlasPoint {
  id: string;
  lng: number;
  lat: number;
  image: string;
}

export interface AtlasMonth {
  month: string;
  days: Map<string, PhotoItem[]>;
  count: number;
}

export const placeGroupSchema = z.object({
  label: z.string(),
  color: z.string(),
  places: z.array(
    z.object({
      label: z.string(),
      coords: z.tuple([z.number(), z.number()]),
      size: z.number().default(0.08),
      current: z.boolean().default(false),
    }),
  ),
});

export type PlaceGroup = z.infer<typeof placeGroupSchema>;
