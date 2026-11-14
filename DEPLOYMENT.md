# ADEZ FLIX deployment

## Playback architecture

ADEZ FLIX is free to browse and use without sign-up, login, an account, subscription, paywall, payment, or admin flow. The Watch page requests the documented stream and caption endpoints from `https://davextechmovieapi.fly.dev` directly in the browser. The obsolete same-origin default-deny `/api/playback/*` gate has been removed; there is no application account or trusted-rights database.

Supported stream routes are movie, TV episode, anime, and live/event. The app selects quality using the stream endpoint's documented resolution parameter and tries lower documented qualities after retryable provider failures or responses without a playable URL. It displays a provider-returned URL in the HTML video source, shows the selected resolution only when the API reports it, and otherwise labels the value as the requested quality. Provider-supplied captions/dub metadata is used where available, with SRT converted to WebVTT when needed. Unavailable streams or unsupported formats show a retry state; the app does not invent URLs, bypass DRM/authentication, or enable downloads.

## Local development and checks

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm test
pnpm build
pnpm start
```

`pnpm dev` runs the Express host and Vite client on `PORT` (3000 by default). `pnpm build` produces `dist/public` and the Express bundle at `dist/index.js`; `pnpm start` serves that production build. Use `pnpm dev:static` or `pnpm build:static` for a browser-only frontend; direct playback does not depend on Express playback routes.

## Static hosting

`vercel.json` builds `dist/public` and rewrites client page routes. Static hosting can browse and play through the external public API without hosting `/api/playback/*`. The API must allow browser requests from the deployed origin, and the stream/subtitle hosts must be reachable and browser-compatible. API outages, missing title streams, CORS policy, or unsupported media codecs can still prevent playback; the app reports those cases rather than fabricating a fallback URL.

`VITE_CATALOG_API_BASE` is a browser-visible, non-secret build value whose default is `https://davextechmovieapi.fly.dev`. Never place credentials, private API keys, or other secrets in it.

After a production domain is assigned, add canonical sitemap URLs in `client/public/sitemap.xml` and the absolute sitemap URL in `client/public/robots.txt`.
