# ADEZ FLIX

ADEZ FLIX is a free-to-browse movie, TV, anime, live, and catalog-discovery app powered by the public REST API at <https://davextechmovieapi.fly.dev>. It requires no sign-up, sign-in, login, subscription, payment, or account profile. Branding: **Build By Arnold Adez** · **Powered by ADEZ TECH** · **+254111783552**.

## Run and build

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm test
pnpm build
pnpm start
```

`pnpm dev` runs the Express host and Vite client together on `PORT` (3000 by default). `pnpm build` creates the frontend in `dist/public` and the Express bundle at `dist/index.js`; `pnpm start` serves the production build. `pnpm dev:static` and `pnpm build:static` run the browser-only app and can use the same public catalog API directly.

`client/public/manus-routes.json` lists the app's page routes. `vercel.json` builds the static client and rewrites page routes. Playback itself does not depend on a same-origin `/api/playback` backend.

`VITE_CATALOG_API_BASE` is an optional **public, non-secret** Vite build variable; `.env.example` contains its default. Vite `VITE_` values are visible in the browser. Never put passwords, private API keys, database URLs, or other secrets in frontend variables.

## Browsing and local data

Catalog browsing is free and does not require an account. My List, search history, and Continue Watching progress are stored only in the current browser/device. Clearing browser storage removes them. There is no account/profile system, cloud sync, admin area, payment flow, or database.

## Playback

After the user selects a title, ADEZ FLIX requests the documented stream endpoint from the public API directly in the browser:

- Movies: `GET /movie/stream/{subject_id}`
- TV episodes: `GET /tv/episode/stream/{subject_id}?season={n}&episode={n}`
- Anime: `GET /anime/stream/{subject_id}` with optional season/episode context
- Live titles/events: `GET /live/stream/{subject_id}`

The player requests supported quality levels and tries lower documented qualities after retryable provider failures or responses without a playable URL. It uses only an HTTP(S) media URL returned by the provider. When the API reports the selected resolution, the player displays it; when that field is omitted, the player labels the quality as a request instead of claiming it is the actual stream resolution. It does not fabricate URLs, bypass DRM/authentication, or expose download actions. Provider-returned audio dub choices are selectable when available.

For episodic titles, ADEZ FLIX prefers the provider's season and episode metadata. If those dedicated routes are temporarily unavailable, the app can use the generic item response and its provider-reported episode counts to keep numbered episode links available.

Caption metadata is requested from the documented movie/TV, anime, or subject-and-stream caption route. The player prefers the API's subtitle proxy URL, converts SRT subtitle content to WebVTT where needed, and provides a subtitle selector. Subtitle and playback availability depend on the provider. A browser-only/static deployment can play streams when the API and media host are reachable and the API permits browser requests; it does not need the removed default-deny gate.

See [API_REFERENCE.md](API_REFERENCE.md) for endpoint and response details and [DEPLOYMENT.md](DEPLOYMENT.md) for hosting notes.
