import type { Context, MiddlewareHandler } from "hono";
import { getSession } from "void/auth";
import type { WorkerBindings } from "~/types";
import { verifyApiKey } from "./apikey";
import { verifyOwnerToken } from "./oauth";

export interface WorkerVariables {
  ownerId: string;
}

export type WorkerEnv = {
  Bindings: WorkerBindings;
  Variables: WorkerVariables;
};

export async function requestIsOwner(c: Context<WorkerEnv>): Promise<boolean> {
  if (!c.env.ALLOWED_EMAIL) return false;
  const session = getSession();
  return session?.user?.email === c.env.ALLOWED_EMAIL;
}

export function createOwnerGuard(
  notConfiguredMessage = "Not configured",
): MiddlewareHandler<WorkerEnv> {
  return async (c, next) => {
    const allowedEmail = c.env.ALLOWED_EMAIL;
    if (!allowedEmail) return c.json({ error: notConfiguredMessage }, 500);

    const authorization = c.req.header("authorization");
    if (authorization !== undefined) {
      const verified =
        authorization.split(".").length === 3
          ? await verifyOwnerToken(c.req.raw, allowedEmail)
          : await verifyApiKey(c.req.raw, c.env.API_KEY);
      if (!verified) {
        c.header("WWW-Authenticate", "Bearer");
        return c.json({ error: "Unauthorized" }, 401);
      }
      const owner = await c.env.DB.prepare(`SELECT id FROM user WHERE email = ? LIMIT 1`)
        .bind(allowedEmail)
        .first<{ id: string }>();
      if (!owner) return c.json({ error: "Owner account not found." }, 503);
      c.set("ownerId", owner.id);
      await next();
      return;
    }

    const session = getSession();
    if (!session?.user?.email) return c.json({ error: "Unauthorized" }, 401);
    if (session.user.email !== allowedEmail) return c.json({ error: "Forbidden" }, 403);

    c.set("ownerId", session.user.id);
    await next();
  };
}
