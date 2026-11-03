import { defineEnv, email, string } from "void/env";

export default defineEnv({
  BETTER_AUTH_SECRET: string(),
  YOU_FIND_ME_CLIENT_SECRET: string(),
  ALLOWED_EMAIL: email().optional(),
  SPOTIFY_PLAYLIST_ID: string().default("2IQN4jtkTtSyVQe62fOuMo"),
});
