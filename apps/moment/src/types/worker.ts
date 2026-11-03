export interface ApiKeyBinding {
  getByName(name: string): { fetch(request: Request): Promise<Response> };
}

export interface WorkerBindings {
  DB: D1Database;
  MOMENT_BUCKET: R2Bucket;
  MOMENT_CACHE: KVNamespace;
  API_KEY: ApiKeyBinding;
  SPOTIFY_PLAYLIST_ID?: string;
  ASSETS: Fetcher;
}
