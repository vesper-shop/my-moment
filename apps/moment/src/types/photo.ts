import { z } from "zod";

const geoSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const photoUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(50)).max(10).optional(),
  date: z.string().trim().optional().nullable(),
  geo: geoSchema.optional().nullable(),
});

const tagsTransform = z.array(z.string()).transform((arr) =>
  arr
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 50)
    .slice(0, 10),
);

export const photoUploadSchema = z.object({
  title: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  date: z.string().trim().optional(),
  geo: geoSchema.optional(),
  tags: tagsTransform,
  thumbHash: z.string().optional(),
  width: z.coerce.number().int().min(0),
  height: z.coerce.number().int().min(0),
  aspectRatio: z.coerce.number().positive().optional(),
});

export const photoItemSchema = z.object({
  id: z.string(),
  url: z.string(),
  thumbnailUrl: z.string(),
  thumbHash: z.string().optional(),
  title: z.string(),
  width: z.number(),
  height: z.number(),
  aspectRatio: z.number().optional(),
  tags: z.array(z.string()),
  date: z.string().optional(),
  description: z.string().optional(),
  size: z.number().optional(),
  format: z.string().optional(),
  updatedAt: z.string(),
  geo: geoSchema.optional(),
});

export type PhotoItem = z.infer<typeof photoItemSchema>;

export const tagCountSchema = z.object({
  name: z.string(),
  count: z.number().int(),
});

export type TagCount = z.infer<typeof tagCountSchema>;
