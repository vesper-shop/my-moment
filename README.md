# my-moment

Personal moments — [moment.you-find.me](https://moment.you-find.me)

## Stack

Vite+ · Void · SolidJS · TypeScript · TailwindCSS v4 · Hono · TanStack Router · Cloudflare Workers · KV · Mapbox · giscus

## Features

- **Gallery** — the public photos of the [Vesper](https://noted-this.date) journal @yiming1234, in masonry and list views
- **Atlas** — every photo on a map and on a calendar
- **Collection** — playlists, anime, and films
- **Guestbook** — GitHub Discussions through giscus, above the notes kept from the old guestbook
- **Haul / Wishlist** — purchases and wants

Collection, haul and wishlist are static data in `apps/moment/src/data/collection.json`, with their
images in `apps/moment/public/img/`; edit them in the repository.

## Data

Photos live in Vesper. The worker reads them with a workspace API token (`VESPER_TOKEN`), shows only
entries made public there, and caches the list for five minutes. Opening `/api/vesper/connect` once
signs the owner in through OAuth so the header card can show the workspace handle and link to
`https://<handle>.noted-this.date/`; the callback checks the workspace UUID and refuses any other.
Add, edit and delete photos in Vesper.

## API

Read-only, under `/api`, described by
[`/api/openapi.json`](https://moment.you-find.me/api/openapi.json).

```sh
curl https://moment.you-find.me/api/photos?search=edinburgh
```

`/llms.txt` and `/.well-known/api-catalog` list these entry points.

## References

- [Afilmory/afilmory](https://github.com/Afilmory/afilmory) — HEIC/HEIF detection and browser-side conversion
- [Pleasurecruise/my-memos](https://github.com/Pleasurecruise/my-memos) — workspace layout, UI package, theming, and Cloudflare patterns
- [dogxii/iGoods](https://github.com/dogxii/iGoods) — Haul item model, ratings, and filtering
- [dogxii/astro-doge](https://github.com/dogxii/astro-doge) — Guestbook interactions and emoji packs

## License

[AGPL-v3](LICENSE)
