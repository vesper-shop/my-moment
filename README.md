# my-moment

Personal moments — [moment.you-find.me](https://moment.you-find.me)

## Stack

Vite+ · Void · SolidJS · TypeScript · TailwindCSS v4 · Hono · TanStack Router · Better Auth · Cloudflare Workers · D1 · R2 · KV · Durable Objects · Mapbox

## Features

- **Gallery** — photos in masonry and list views
- **Journey** — places on an interactive map
- **Collection** — playlists, anime, and films
- **Guestbook** — signed-in messages with replies
- **Haul / Wishlist** — purchases and wants

## API

One REST surface under `/api`, described by
[`/api/openapi.json`](https://moment.you-find.me/api/openapi.json). Reads need no token; writes take
the owner session or an access token issued by the you-find.me gateway (`moment:write` scope).

```sh
curl https://moment.you-find.me/api/photos?search=edinburgh
curl -X PATCH -H "Authorization: Bearer $MOMENT_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"tags":["travel"]}' https://moment.you-find.me/api/photos/<id>
```

The MCP endpoint at `/api/mcp` takes the same token; clients discover the gateway from
`/.well-known/oauth-protected-resource`, register and sign the owner in: `list_photos`, `search_photos`, `get_photo`,
`create_photo`, `update_photo`, `delete_photo`, `list_tags`. `/llms.txt` and
`/.well-known/api-catalog` list these entry points.

## References

- [Afilmory/afilmory](https://github.com/Afilmory/afilmory) — HEIC/HEIF detection and browser-side conversion
- [Pleasurecruise/my-memos](https://github.com/Pleasurecruise/my-memos) — workspace layout, UI package, theming, and Cloudflare patterns
- [sxzz/kevins-journey](https://github.com/sxzz/kevins-journey) — Journey map visualization
- [dogxii/iGoods](https://github.com/dogxii/iGoods) — Haul item model, ratings, and filtering
- [dogxii/astro-doge](https://github.com/dogxii/astro-doge) — Guestbook interactions and emoji packs

## License

[AGPL-v3](LICENSE)
