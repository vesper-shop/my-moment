import { defineEnv, string } from "void/env";

export default defineEnv({
  BETTER_AUTH_SECRET: string(),
  SPOTIFY_PLAYLIST_ID: string().default("2IQN4jtkTtSyVQe62fOuMo"),
});
