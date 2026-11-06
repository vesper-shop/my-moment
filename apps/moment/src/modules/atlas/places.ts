import { parse } from "yaml";
import { z } from "zod";
import { placeGroupSchema } from "~/types";
import raw from "./places.yaml?raw";

export const DEFAULT_GROUPS = ["Visited", "Stay", "Residence"];

export const groups = z.array(placeGroupSchema).parse(parse(raw));
