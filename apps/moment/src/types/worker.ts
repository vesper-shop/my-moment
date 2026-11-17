export interface WorkerBindings {
  MOMENT_CACHE: KVNamespace;
  VESPER_TOKEN: string;
  SPOTIFY_PLAYLIST_ID?: string;
  ASSETS: Fetcher;
}
