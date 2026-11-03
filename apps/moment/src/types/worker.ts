export interface WorkerBindings {
  DB: D1Database;
  MOMENT_BUCKET: R2Bucket;
  MOMENT_CACHE: KVNamespace;
  SPOTIFY_PLAYLIST_ID?: string;
  ASSETS: Fetcher;
}
