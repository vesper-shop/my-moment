import { customSession, genericOAuth } from "better-auth/plugins";
import { defineAuth } from "void/auth";
import type { ValidatedEnv } from "void/env";
import { HOST_DISPLAY_NAME } from "./src/lib/identity.ts";
import { GATEWAY_OWNER_SUBJECT, GATEWAY_PROVIDER_ID } from "./src/lib/server/owner.ts";

type AuthEnv = Pick<ValidatedEnv, "YOU_FIND_ME_CLIENT_SECRET">;

export default defineAuth(({ defaults, env: authEnv, request }) => {
  const { YOU_FIND_ME_CLIENT_SECRET } = authEnv as AuthEnv;

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
      accountLinking: { enabled: false },
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
            providerId: GATEWAY_PROVIDER_ID,
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
      customSession(async ({ user, session }, ctx) => {
        const accounts = await ctx.context.internalAdapter.findAccounts(user.id);
        const isHost = accounts.some(
          (account) =>
            account.providerId === GATEWAY_PROVIDER_ID &&
            account.accountId === GATEWAY_OWNER_SUBJECT,
        );
        return { user: isHost ? { ...user, name: HOST_DISPLAY_NAME } : user, session };
      }),
    ],
  };
});
