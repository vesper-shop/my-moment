import { z } from "zod";
import data from "~/data/collection.json";
import { goodsItemSchema, mediaItemSchema, wishItemSchema } from "~/types";

export const haulItems = z.array(goodsItemSchema).parse(data.haul);
export const wishlistItems = z.array(wishItemSchema).parse(data.wishlist);
export const mediaItems = z.array(mediaItemSchema).parse(data.media);
