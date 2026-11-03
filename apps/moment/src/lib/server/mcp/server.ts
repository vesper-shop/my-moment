import {
  createMcpHandler,
  McpServer,
  type CallToolResult,
  type McpHttpHandler,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import type { WorkerBindings } from "~/types";
import { photoUpdateSchema } from "~/types/photo";
import {
  createPhotoFromR2,
  deletePhoto,
  getPhoto,
  listPhotos,
  listTagCounts,
  updatePhoto,
} from "../photos/service";
import { MAX_FILTER_TAGS, dateSchema, photoCreateSchema, searchSchema } from "../photos/schema";

const SEARCH_LIMIT = 10;

export function createMomentMcpHandler(env: WorkerBindings, ownerId: string): McpHttpHandler {
  return createMcpHandler(
    () => {
      const server = new McpServer(
        { name: "my-moment", version: "1.0.0" },
        { capabilities: { tools: {} } },
      );

      server.registerTool(
        "list_tags",
        {
          description:
            "List all photo tags with counts. Call this before filtering by a user-provided tag.",
          inputSchema: z.object({}),
          annotations: { readOnlyHint: true, destructiveHint: false },
        },
        async (): Promise<CallToolResult> => {
          const value = { tags: await listTagCounts(env.DB) };
          return {
            content: [{ type: "text", text: JSON.stringify(value) }],
            structuredContent: value,
          };
        },
      );

      server.registerTool(
        "list_photos",
        {
          description:
            "Browse photos newest first by date range and tags without requiring keywords.",
          inputSchema: z.object({
            fromDate: dateSchema.optional(),
            toDate: dateSchema.optional(),
            tags: z.array(z.string()).max(MAX_FILTER_TAGS).default([]),
            limit: z.number().int().min(1).max(20).default(10),
          }),
          annotations: { readOnlyHint: true, destructiveHint: false },
        },
        async ({ fromDate, toDate, tags, limit }): Promise<CallToolResult> => {
          const { photos } = await listPhotos(env.DB, {
            fromDate,
            toDate,
            tags: { names: tags, mode: "all" },
            order: "desc",
            limit,
          });
          const value = { photos };
          return {
            content: [{ type: "text", text: JSON.stringify(value) }],
            structuredContent: value,
          };
        },
      );

      server.registerTool(
        "get_photo",
        {
          description: "Read one photo with its full metadata by ID.",
          inputSchema: z.object({ id: z.string().uuid() }),
          annotations: { readOnlyHint: true, destructiveHint: false },
        },
        async ({ id }): Promise<CallToolResult> => {
          const photo = await getPhoto(env.DB, id);
          if (!photo) {
            const value = {
              error: { code: "PHOTO_NOT_FOUND", message: "Photo not found." },
            };
            return {
              isError: true,
              content: [{ type: "text", text: "Photo not found." }],
              structuredContent: value,
            };
          }
          const value = { photo };
          return {
            content: [{ type: "text", text: JSON.stringify(value) }],
            structuredContent: value,
          };
        },
      );

      server.registerTool(
        "search_photos",
        {
          description:
            "Search photo titles, descriptions, and tags by keyword, optionally constrained by dates and tags.",
          inputSchema: z.object({
            query: searchSchema,
            fromDate: dateSchema.optional(),
            toDate: dateSchema.optional(),
            tags: z.array(z.string()).max(MAX_FILTER_TAGS).default([]),
          }),
          annotations: { readOnlyHint: true, destructiveHint: false },
        },
        async ({ query, fromDate, toDate, tags }): Promise<CallToolResult> => {
          const { photos } = await listPhotos(env.DB, {
            search: query,
            fromDate,
            toDate,
            tags: { names: tags, mode: "all" },
            order: "desc",
            limit: SEARCH_LIMIT,
          });
          const value = { type: "photo-search-results", query, photos };
          return {
            content: [{ type: "text", text: JSON.stringify(value) }],
            structuredContent: value,
          };
        },
      );

      server.registerTool(
        "create_photo",
        {
          description:
            "Create photo metadata after the original and thumbnail objects have been uploaded to R2.",
          inputSchema: photoCreateSchema,
          annotations: { readOnlyHint: false, destructiveHint: false },
        },
        async (input): Promise<CallToolResult> => {
          const value = {
            photo: await createPhotoFromR2(env.DB, env.MOMENT_BUCKET, ownerId, input),
          };
          return {
            content: [{ type: "text", text: JSON.stringify(value) }],
            structuredContent: value,
          };
        },
      );

      server.registerTool(
        "update_photo",
        {
          description:
            "Update photo metadata. Obtain its ID with list_photos or search_photos first.",
          inputSchema: photoUpdateSchema.extend({ id: z.string().uuid() }),
          annotations: { readOnlyHint: false, destructiveHint: false },
        },
        async ({ id, ...input }): Promise<CallToolResult> => {
          if (Object.keys(input).length === 0) {
            const value = {
              error: { code: "NO_PHOTO_CHANGES", message: "No photo changes provided." },
            };
            return {
              isError: true,
              content: [{ type: "text", text: "No photo changes provided." }],
              structuredContent: value,
            };
          }
          const photo = await updatePhoto(env.DB, id, input);
          if (!photo) {
            const value = {
              error: { code: "PHOTO_NOT_FOUND", message: "Photo not found." },
            };
            return {
              isError: true,
              content: [{ type: "text", text: "Photo not found." }],
              structuredContent: value,
            };
          }
          const value = { photo };
          return {
            content: [{ type: "text", text: JSON.stringify(value) }],
            structuredContent: value,
          };
        },
      );

      server.registerTool(
        "delete_photo",
        {
          description: "Permanently delete a photo and its R2 objects. Confirm before calling.",
          inputSchema: z.object({ id: z.string().uuid() }),
          annotations: { readOnlyHint: false, destructiveHint: true },
        },
        async ({ id }): Promise<CallToolResult> => {
          const deleted = await deletePhoto(env.DB, env.MOMENT_BUCKET, id);
          if (!deleted) {
            const value = {
              error: { code: "PHOTO_NOT_FOUND", message: "Photo not found." },
            };
            return {
              isError: true,
              content: [{ type: "text", text: "Photo not found." }],
              structuredContent: value,
            };
          }
          const value = { id, deleted: true };
          return {
            content: [{ type: "text", text: JSON.stringify(value) }],
            structuredContent: value,
          };
        },
      );

      return server;
    },
    { legacy: "stateless", responseMode: "auto" },
  );
}
