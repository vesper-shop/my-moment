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
