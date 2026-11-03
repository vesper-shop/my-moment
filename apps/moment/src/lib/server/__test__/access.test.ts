import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { WorkerBindings } from "~/types";

const getSession = vi.hoisted(() => vi.fn());

vi.mock("void/auth", () => ({ getSession }));

import { createOwnerGuard, type WorkerEnv } from "../access";

const ownerDatabase = {
  prepare: () => ({ bind: () => ({ first: async () => ({ userId: "owner-id" }) }) }),
};
const env = { DB: ownerDatabase } as unknown as WorkerBindings;

function createApp() {
  const app = new Hono<WorkerEnv>();
  app.get("/private", createOwnerGuard(), (c) => c.json({ ownerId: c.get("ownerId") }));
  return app;
}

describe("createOwnerGuard", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("returns 401 when there is no signed-in user", async () => {
    getSession.mockReturnValue(null);

    const response = await createApp().request("/private", undefined, env);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when the signed-in user is not the owner", async () => {
    getSession.mockReturnValue({ user: { id: "guest-id" } });

    const response = await createApp().request("/private", undefined, env);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("rejects a bearer token the gateway did not issue without reading the session", async () => {
    const response = await createApp().request(
      "/private",
      { headers: { authorization: "Bearer not-a-jwt" } },
      env,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("passes the owner id to protected handlers", async () => {
    getSession.mockReturnValue({ user: { id: "owner-id" } });

    const response = await createApp().request("/private", undefined, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ownerId: "owner-id" });
  });
});
