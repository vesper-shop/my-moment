import type { Context, MiddlewareHandler } from "hono";
import { getSession } from "void/auth";
import type { WorkerBindings } from "~/types";
import { verifyApiKey } from "./apikey";
import { verifyOwnerToken } from "./oauth";
import { findOwnerId } from "./owner";

export interface WorkerVariables {
  ownerId: string;
}

export type WorkerEnv = {
  Bindings: WorkerBindings;
  Variables: WorkerVariables;
};

export async function requestIsOwner(c: Context<WorkerEnv>): Promise<boolean> {
  const session = getSession();
  if (!session?.user) return false;
  return session.user.id === (await findOwnerId(c.env.DB));
}

export function createOwnerGuard(): MiddlewareHandler<WorkerEnv> {
  return async (c, next) => {
    const authorization = c.req.header("authorization");
    if (authorization !== undefined) {
      const verified =
        authorization.split(".").length === 3
          ? await verifyOwnerToken(c.req.raw)
          : await verifyApiKey(c.req.raw, c.env.API_KEY);
      if (!verified) {
        c.header("WWW-Authenticate", "Bearer");
        return c.json({ error: "Unauthorized" }, 401);
      }
      const ownerId = await findOwnerId(c.env.DB);
      if (!ownerId) return c.json({ error: "Owner account not found." }, 503);
      c.set("ownerId", ownerId);
      await next();
      return;
    }

    const session = getSession();
    if (!session?.user) return c.json({ error: "Unauthorized" }, 401);
    if (session.user.id !== (await findOwnerId(c.env.DB))) {
      return c.json({ error: "Forbidden" }, 403);
    }

    c.set("ownerId", session.user.id);
    await next();
  };
}
