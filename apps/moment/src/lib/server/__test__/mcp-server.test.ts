import { z } from "zod";
import { describe, expect, it } from "vite-plus/test";
import type { WorkerBindings } from "~/types";
import { createMomentMcpHandler } from "../mcp/server";

describe("MCP photo tools", () => {
  it("exposes the six external photo tools", async () => {
    const env: WorkerBindings = {
      DB: {} as D1Database,
      MOMENT_BUCKET: {} as R2Bucket,
      MOMENT_CACHE: {} as KVNamespace,
      ASSETS: {} as Fetcher,
    };
    const handler = createMomentMcpHandler(env, "owner-1");
    const response = await handler.fetch(
      new Request("https://mcp.test/api/mcp", {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-11-25",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );
    expect(response.status).toBe(200);
    const dataLine = (await response.text()).split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) throw new Error("MCP response did not contain an SSE data event.");
    const result = z
      .object({
        result: z.object({ tools: z.array(z.object({ name: z.string() })) }),
      })
      .parse(JSON.parse(dataLine.slice(6)));

    expect(result.result.tools.map(({ name }) => name).sort()).toEqual([
      "create_photo",
      "delete_photo",
      "get_photo",
      "list_photos",
      "list_tags",
      "search_photos",
      "update_photo",
    ]);
    await handler.close();
  });
});
