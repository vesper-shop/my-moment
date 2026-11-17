import { z } from "zod";
import type { WorkerBindings } from "~/types";

export const VESPER_ORIGIN = "https://noted-this.date";
const RESOURCE = `${VESPER_ORIGIN}/mcp`;
const SCOPE = "entries:read offline_access";
const CLIENT_KEY = "vesper:client";
const GRANT_KEY = "vesper:grant";
const HEADERS = { "user-agent": "my-moment" };

const metadataSchema = z.object({
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  registration_endpoint: z.string(),
});
const clientSchema = z.object({ client_id: z.string(), redirect_uri: z.string() });
const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
});
const pendingSchema = z.object({ verifier: z.string() });
const workspaceSchema = z.object({
  workspace: z.object({ id: z.string(), handle: z.string() }),
  profile: z.object({ name: z.string(), image: z.string().nullable() }),
});
const PROFILE_KEY = "vesper:profile";
const OWNER_KEY = "vesper:owner-workspace";

export class VesperError extends Error {}

async function read<S extends z.ZodType>(schema: S, response: Response): Promise<z.output<S>> {
  if (!response.ok)
    throw new VesperError(`${response.status} ${(await response.text()).slice(0, 200)}`);
  return schema.parse(await response.json());
}

const form = (fields: Record<string, string>) => ({
  method: "POST",
  headers: { ...HEADERS, "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields),
});

const base64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

async function metadata() {
  return read(
    metadataSchema,
    await fetch(`${VESPER_ORIGIN}/.well-known/oauth-authorization-server/api/auth`, {
      headers: HEADERS,
    }),
  );
}

async function client(env: WorkerBindings, redirectUri: string) {
  const saved = await env.MOMENT_CACHE.get(CLIENT_KEY, "json");
  const parsed = clientSchema.safeParse(saved);
  if (parsed.success && parsed.data.redirect_uri === redirectUri) return parsed.data;
  const { registration_endpoint } = await metadata();
  const registered = await read(
    z.object({ client_id: z.string() }),
    await fetch(registration_endpoint, {
      method: "POST",
      headers: { ...HEADERS, "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "My Moment",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        scope: SCOPE,
      }),
    }),
  );
  const result = { client_id: registered.client_id, redirect_uri: redirectUri };
  await env.MOMENT_CACHE.put(CLIENT_KEY, JSON.stringify(result));
  return result;
}

export async function authorize(env: WorkerBindings, redirectUri: string) {
  const [{ authorization_endpoint }, registered] = await Promise.all([
    metadata(),
    client(env, redirectUri),
  ]);
  const state = random();
  const verifier = random();
  const challenge = base64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  await env.MOMENT_CACHE.put(`vesper:pending:${state}`, JSON.stringify({ verifier }), {
    expirationTtl: 600,
  });
  const url = new URL(authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: registered.client_id,
    redirect_uri: redirectUri,
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: RESOURCE,
  }).toString();
  return url.toString();
}

export async function callback(
  env: WorkerBindings,
  redirectUri: string,
  code: string,
  state: string,
) {
  const pending = pendingSchema.parse(
    await env.MOMENT_CACHE.get(`vesper:pending:${state}`, "json"),
  );
  await env.MOMENT_CACHE.delete(`vesper:pending:${state}`);
  const [{ token_endpoint }, registered] = await Promise.all([
    metadata(),
    client(env, redirectUri),
  ]);
  const tokens = await read(
    tokenSchema,
    await fetch(
      token_endpoint,
      form({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: registered.client_id,
        code_verifier: pending.verifier,
        resource: RESOURCE,
      }),
    ),
  );
  if (!tokens.refresh_token) throw new VesperError("Vesper did not grant offline access.");
  const me = await read(
    workspaceSchema,
    await fetch(`${VESPER_ORIGIN}/api/workspace`, {
      headers: { ...HEADERS, authorization: `Bearer ${tokens.access_token}` },
    }),
  );
  if (me.workspace.id !== (await ownerId(env)))
    throw new VesperError("This Vesper workspace is not the one this site belongs to.");
  await saveGrant(env, tokens, tokens.refresh_token);
  await env.MOMENT_CACHE.put(
    PROFILE_KEY,
    JSON.stringify({
      handle: me.workspace.handle,
      name: me.profile.name,
      image: me.profile.image,
    }),
  );
}

async function saveGrant(
  env: WorkerBindings,
  tokens: z.output<typeof tokenSchema>,
  previous: string,
) {
  const grant = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || previous,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
  await env.MOMENT_CACHE.put(GRANT_KEY, JSON.stringify(grant));
  return grant;
}

async function ownerId(env: WorkerBindings) {
  const cached = await env.MOMENT_CACHE.get(OWNER_KEY);
  if (cached) return cached;
  const response = await fetch(`${VESPER_ORIGIN}/api/workspace`, {
    headers: { ...HEADERS, authorization: `Bearer ${env.VESPER_TOKEN}` },
  });
  if (!response.ok) return null;
  const id = (await read(workspaceSchema, response)).workspace.id;
  await env.MOMENT_CACHE.put(OWNER_KEY, id, { expirationTtl: 3600 });
  return id;
}

export async function readProfile(env: WorkerBindings) {
  return env.MOMENT_CACHE.get(PROFILE_KEY, "json");
}

export async function vesperFetch(env: WorkerBindings, path: string) {
  const response = await fetch(`${VESPER_ORIGIN}${path}`, {
    headers: { ...HEADERS, authorization: `Bearer ${env.VESPER_TOKEN}` },
  });
  if (!response.ok)
    throw new VesperError(`${path}: ${response.status} ${(await response.text()).slice(0, 200)}`);
  return response;
}
