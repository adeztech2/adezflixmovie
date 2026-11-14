# ADEZ FLIX — Authorized API Playback Update

## Approved scope and implementation approach

The user has explicitly confirmed that they own or are authorized to stream the catalog returned by `https://davextechmovieapi.fly.dev` and requested the documented stream and caption endpoints be wired into ADEZ FLIX. This supersedes the earlier default-deny playback requirement. Use the API's documented movie, TV-episode, Anime, and live stream routes and its caption endpoints. Use the API's returned playback URLs or browser-compatible sources as documented; do not invent URLs, bypass DRM/authentication, or add download actions.

Keep the service free to browse and play without sign-up, login, payment, or a paywall. Keep My List and watch progress device-local. Keep the managed database and Redis disabled. The existing Express/Vite server remains for development and Preview; the player will call the public API from the browser, so the static Vercel build can use the same configured API without a local authorization proxy.

For movies, request `GET /movie/stream/{subject_id}?resolution={360|480|720|1080}`. For TV, use `GET /tv/episode/stream/{subject_id}?season={n}&episode={n}&resolution={quality}`. For Anime, use `GET /anime/stream/{subject_id}` with optional season/episode and the requested resolution. For Live TV, use `GET /live/stream/{subject_id}?resolution={quality}`. Parse `url`/`playback_url` with the existing API URL extractor. Query the appropriate caption route: `/item/{subject_id}/captions/auto` for available MovieBox captions and `/anime/captions/{subject_id}` for Anime, passing the documented resolution and episode parameters where supported. Prefer the provider's `proxyUrl`; convert SRT text to WebVTT for browser `<track>` elements. Expose only the quality choices documented by the API. If a dedicated TV info or season route is unavailable, use generic `/item/{subject_id}` metadata and a provider-reported `total_episode` count to offer numbered episode links; never guess a catalog ID or episode count. Do not expose or activate download routes.

Handle unavailable title streams, unsupported browser formats, empty captions, network errors, timeout, and retry states without blocking catalog browsing. Preserve episode context and next-episode links. Show actual stream metadata only after a successful response and allow the user to press Play; do not autoplay.

## Structure and project files

- `client/src/lib/adezflix-api.ts`: existing typed API and extraction helpers; extend only if actual response shapes require it.
- `client/src/lib/playback.ts`: new stream-route selection, resolution, and caption-format helpers for the documented API endpoints.
- `client/src/pages/Watch.tsx`: request the selected route and quality, load the returned browser-compatible URL, provide native controls and available captions, and preserve TV/Anime episode navigation.
- `client/src/pages/TitleDetails.tsx`: enable Play for catalog entries and episodes, preserving metadata and local My List behavior.
- `server/_core/index.ts`: retain the Express/Vite development host and health route; remove the obsolete default-deny playback-gate registration.
- `client/src/lib/playback-gate.ts` and `server/_core/playbackGate.ts`: remove the obsolete gate and references rather than retaining a misleading always-denied endpoint.
- `API_REFERENCE.md`, `README.md`, and `DEPLOYMENT.md`: document the owner-authorized API stream/caption calls, no-login behavior, no-download scope, and direct API usage from static Vercel output.

## Design direction (preserve the approved existing style)

**Design movement:** Neon-cinema editorial. **Core principles:** free and frictionless discovery; playback works from provider-returned sources; supplied metadata only; mobile-first clarity. **Color philosophy:** midnight black and navy keep attention on cinema artwork, while electric cyan (`#20C9F0`) and royal blue (`#1769D2`) identify the brand and interactive state. **Layout paradigm:** editorial hero, horizontal browse rails, and dedicated catalog/detail/player pages with compact navigation. **Signature elements:** cyan/blue A-mark; translucent top bar; cinematic artwork vignettes and poster shelves. **Interaction:** direct browsing and playback without an account; local-only My List; clear resolution/subtitle choices and retry feedback. **Animation:** restrained image drift and short hover/focus transitions; respect reduced motion. **Typography:** Space Grotesk for display and DM Sans for supporting text. **Brand essence:** free catalog discovery and playback for movie/TV fans; expressive, transparent, easy to use. **Brand voice:** concise and direct; examples: “Explore the catalog. No account needed.” and “Pick a title and press play.” **Wordmark:** existing custom cyan/blue letter-A mark beside ADEZ FLIX. **Signature color:** electric cyan `#20C9F0`.

## Project structure

The Vite/React app stays in `client/`; Express and Vite middleware stay in `server/_core/`; existing `shared/` files are left untouched unless the checked implementation requires them. Root documentation includes the updated plan, checklist, API reference, setup guide, and static deployment instructions. No account system, database, Redis, payments, or download workflow is added.
