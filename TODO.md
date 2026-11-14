# ADEZ FLIX — Delivery Checklist

## Free access, brand, and responsive website
- [x] Name the platform ADEZ FLIX and display the tagline “Your Entertainment. Your World.”
- [x] Use the requested black/blue/cyan identity: background `#07090F`, cyan `#20C9F0`, royal blue `#1769D2`, white/soft-grey text, and Space Grotesk / DM Sans.
- [x] Use a futuristic A-and-wordmark mark and a premium, clean, cinematic interface.
- [x] Display “Build By Arnold Adez”, “Powered by ADEZ TECH”, and `+254111783552` in the branded footer.
- [x] Make browsing and playback free, with no sign-up, sign-in, login, paid plan, subscription, payment, or paywall; remove the Account/Profile navigation and Account route/page.
- [x] Keep My List, Continue Watching/resume position, search history, and viewing history on this device only; explain that no account or cloud sync is required.
- [x] Provide Home, Movies, TV Shows, Live TV, My List, and search navigation without an Account/Profile link.

## Homepage and catalog discovery
- [x] Use provider-supplied featured artwork/title/description/year/genre, More Info, and Play action.
- [x] Show Trending Movies, Popular Movies, Latest Releases, Top Rated Movies, Popular TV Series, Recommended For You, and Continue Watching with real provider data or clearly labeled local history.
- [x] Render provider poster cards, supplied ratings only, responsive grids/horizontal shelves, loading skeletons, empty/error/retry feedback, and smooth hover transitions.
- [x] Provide dedicated Movies and TV Shows pages with documented popular/new/top-or-trending feeds, API-returned genre filters, search/filter, pagination/load-more, and responsive poster grids.
- [x] Provide Live TV catalog and search from documented routes.
- [x] Search movies, TV shows, Anime, Live TV, and other supported catalog types; show provider-result suggestions with poster previews, device-local search history, popular-title shortcuts, and a no-results state.

## Owner-authorized streaming and captions
- [x] Record the user's explicit confirmation: “I own or am authorized to stream this catalog; wire the documented stream/caption routes.”
- [x] Use `GET /movie/stream/{subject_id}` with documented resolution choices and parse the provider's returned `url`/`playback_url`.
- [x] Use `GET /tv/episode/stream/{subject_id}` with required season and episode parameters plus resolution; preserve next-episode navigation.
- [x] Use `GET /anime/stream/{subject_id}` with optional season and episode parameters plus resolution; show retry feedback when the provider returns no stream.
- [x] Use `GET /live/stream/{subject_id}` for authorized live/event catalog entries when the provider lists an event.
- [x] Provide 360p, 480p, 720p, and 1080p choices as supported by the API; reflect the actual returned resolution and handle unavailable sources with retry feedback.
- [x] Load captions from the documented Movie/TV and Anime caption routes, prefer provider `proxyUrl` tracks, convert SRT to browser-compatible WebVTT where needed, and let users select a track or turn captions off.
- [x] Keep native playback controls, do not autoplay, and do not expose download endpoints or add download actions.
- [x] Handle 404/no-stream responses, unsupported formats, empty captions, timeouts, and upstream failures without breaking catalog browsing.
- [x] When dedicated TV info or season metadata is unavailable, use generic `/item/{subject_id}` metadata and provider-reported episode counts for numbered episode links; do not guess catalog IDs or episode counts.

## Technical and documentation delivery
- [x] Remove the obsolete default-deny playback gate and direct the player to the owner-authorized documented API routes.
- [x] Update `API_REFERENCE.md`, `README.md`, and `DEPLOYMENT.md` to document the authorized API playback/captions, no-login/no-paywall behavior, and no-download scope.
- [x] Keep the managed database and Redis disabled; retain the existing Express/Vite development host.
- [x] Configure Vite HMR to use the app listener and Cloud Preview WSS connection; the public Preview handshake was verified on port 443 using Vite's `vite-hmr` subprotocol.
- [x] Preserve responsive layouts, API timeout handling, static route declarations, Vercel configuration, and the GitHub/Vercel instructions.
- [ ] Verify working movie, TV/Anime, caption, and live playback paths in Preview using the API's current responses; do not publish the site.
  - Evidence: the Movie and TV episode players both advanced during muted playback checks; six provider-count TV episode links and the next-episode action appeared; an English WebVTT caption track loaded and was selectable. The sampled Anime ID returned 404, and `GET /live?page=1` returned 200 with no catalog entries, so no current live stream was available to test. Detailed responses are recorded in `API_REFERENCE.md`.
- [x] Refresh the source ZIP from current application sources and documentation, excluding dependencies, build output, and local environment files.
- [ ] Save the playback update as a checkpoint on `origin/main`; defer while Auto Publish is enabled because this task requires no publication.
