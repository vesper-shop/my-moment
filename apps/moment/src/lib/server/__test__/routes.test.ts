import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { WorkerBindings } from "~/types";

const getSession = vi.hoisted(() => vi.fn());

vi.mock("void/auth", () => ({ getSession }));

import app from "../../../../worker";

const env = {
  DB: { prepare: () => ({ bind: () => ({ first: async () => ({ userId: "owner-id" }) }) }) },
} as unknown as WorkerBindings;
const writes = app.routes.filter(
  (route, index, routes) =>
    ["POST", "PUT", "PATCH", "DELETE"].includes(route.method) &&
    route.path !== "/api/*" &&
    routes.findIndex((other) => other.method === route.method && other.path === route.path) ===
      index,
);
const guestWrites = ["/api/messages", "/api/messages/:id", "/api/mcp"];

describe("write routes", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it.each(writes)("$method $path rejects anonymous requests", async (route) => {
    getSession.mockReturnValue(null);

    const response = await app.request(route.path, { method: route.method }, env);

    expect(response.status).toBe(401);
  });

  it.each(writes.filter((route) => !guestWrites.includes(route.path)))(
    "$method $path rejects signed-in guests",
    async (route) => {
      getSession.mockReturnValue({ user: { id: "guest-id" } });

      const response = await app.request(route.path, { method: route.method }, env);

      expect(response.status).toBe(403);
    },
  );
});

describe("GET /api/owner", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it.each([
    { name: "anonymous requests", session: null, owner: false },
    { name: "signed-in guests", session: { user: { id: "guest-id" } }, owner: false },
    { name: "the owner", session: { user: { id: "owner-id" } }, owner: true },
  ])("reports $owner for $name", async ({ session, owner }) => {
    getSession.mockReturnValue(session);

    const response = await app.request("/api/owner", undefined, env);

    await expect(response.json()).resolves.toEqual({ owner });
  });
});
