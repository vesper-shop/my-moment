import { customSession, genericOAuth } from "better-auth/plugins";
import { defineAuth } from "void/auth";
import type { ValidatedEnv } from "void/env";
import { HOST_DISPLAY_NAME } from "./src/lib/identity.ts";

type AuthEnv = Pick<ValidatedEnv, "YOU_FIND_ME_CLIENT_SECRET" | "ALLOWED_EMAIL">;

export default defineAuth(({ defaults, env: authEnv, request }) => {
  const { YOU_FIND_ME_CLIENT_SECRET, ALLOWED_EMAIL } = authEnv as AuthEnv;

  return {
    ...defaults,
    trustedOrigins: [new URL(request.url).origin],
    advanced: {
      ...defaults.advanced,
      useSecureCookies: new URL(request.url).protocol === "https:",
    },
    emailAndPassword: {
      ...defaults.emailAndPassword,
      enabled: false,
    },
    account: {
      ...defaults.account,
      accountLinking: { trustedProviders: ["you-find-me"] },
    },
    session: {
      ...defaults.session,
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    plugins: [
      ...(defaults.plugins ?? []),
      genericOAuth({
        config: [
          {
            providerId: "you-find-me",
            name: "you-find.me",
            discoveryUrl: "https://you-find.me/api/auth/.well-known/openid-configuration",
            clientId: "moment",
            clientSecret: YOU_FIND_ME_CLIENT_SECRET,
            scopes: ["openid", "profile", "email"],
            tokenEndpointAuth: { method: "client_secret_basic" },
            pkce: true,
          },
        ],
      }),
      customSession(async ({ user, session }) => ({
        user:
          ALLOWED_EMAIL && user.email === ALLOWED_EMAIL
            ? { ...user, name: HOST_DISPLAY_NAME }
            : user,
        session,
      })),
    ],
  };
});
