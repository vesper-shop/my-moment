import { defineEnv, string } from "void/env";

export default defineEnv({
  SPOTIFY_PLAYLIST_ID: string().default("2IQN4jtkTtSyVQe62fOuMo"),
  VESPER_TOKEN: string(),
});
