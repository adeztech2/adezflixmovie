# ADEZ FLIX API Reference

ADEZ FLIX uses the public API at <https://davextechmovieapi.fly.dev>. The interactive docs are at <https://davextechmovieapi.fly.dev/docs> and the authoritative operation schemas are in <https://davextechmovieapi.fly.dev/openapi.json>. The user confirmed they own or are authorized to stream this catalog. The public catalog and player do not require ADEZ FLIX sign-in or payment. The browser calls the documented provider stream and caption routes directly; the app does not use a same-origin playback gate.

## Stream operations

| Content | Endpoint | Required parameters | Resolution default |
| --- | --- | --- | --- |
| Movie | `GET /movie/stream/{subject_id}` | `subject_id` | 1080; documented choices 360, 480, 720, 1080 |
| TV episode | `GET /tv/episode/stream/{subject_id}` | `subject_id`, `season`, `episode` | 1080; documented choices 360, 480, 720, 1080 |
| Anime episode | `GET /anime/stream/{subject_id}` | `subject_id`; `season` and `episode` are optional for multi-season titles | 720; documented choices 360, 480, 720, 1080 |
| Live/event | `GET /live/stream/{subject_id}` | `subject_id` | 1080; falls back to the highest available quality |
| Browser-compatible MovieBox stream (alternate) | `GET /bff/stream/{subject_id}` | `subject_id`; optional `season`, `episode`, `resolution` | 1080; described as H.264/AAC with DASH-to-browser transcoding |

Stream metadata responses can include `url`, `playback_url`, `resolution`, `codec`, `browser_compatible`, `available_qualities`, and stream/file arrays. ADEZ FLIX accepts only valid HTTP(S) playback URLs from the provider response. It never fabricates a URL. The client does not add download actions or call documented download endpoints.

## Caption operations

| Content | Endpoint | Contract |
| --- | --- | --- |
| Movie/TV auto captions | `GET /item/{subject_id}/captions/auto?resolution={quality}` | No `resource_id` required; resolution defaults to 1080 |
| Anime captions | `GET /anime/captions/{subject_id}?resolution={quality}&season={n}&episode={n}` | Resolution defaults to 720; season/episode are optional |
| Captions by subject and stream | `GET /captions?subjectId={id}&streamId={id}` | Both query parameters required |
| Captions by resource | `GET /item/{subject_id}/captions?resource_id={resource_id}` | `resource_id` required; the API says it comes from a downloads response |
| Subtitle proxy | `GET /proxy/subtitle?url={signed_subtitle_url}&filename={name}` | `url` required; suggested filename defaults to `subtitle.srt` |

Caption rows can include `id`, `lan`, `lanName`, `url`, `sourceUrl`, `proxyUrl`, `downloadUrl`, `size`, and `delay`. ADEZ FLIX prefers `proxyUrl`; SRT captions must be converted to WebVTT before attaching them as browser subtitle tracks. Caption availability is provider-dependent.

## Related metadata

- `GET /item/{subject_id}/dubs` returns available dubbed language versions.
- `GET /item/{subject_id}/resources` returns resource/resolution detectors.
- Movie and TV descriptive metadata is available from `/movie/info/{subject_id}`, `/tv/info/{subject_id}`, and `/item/{subject_id}`. TV season metadata is available from `/item/{subject_id}/seasons`.
- The browser UI uses title metadata and existing detail routes. It does not activate the API's download endpoints.
- If a stream response reports its selected resolution, the player displays that value; if omitted, the player labels the quality as requested rather than inferring actual stream resolution. It retries lower documented qualities after retryable provider failures, API-declared unavailable responses, or responses without a playable URL.

## Observed behavior

A response-only probe on 2026-11-14 found that some popular-feed titles return `404` from their stream route while other entries return stream metadata; the UI must show an unavailable/retry state for those titles. A successful Anime stream response included `codec: h264`, `browser_compatible: true`, and supported qualities `[360, 480, 720, 1080]`. The returned playback URL served `video/mp4` and honored a one-byte range request. A sample Movie auto-caption request returned 13 caption rows. Signed stream and subtitle URLs were not recorded in this document.

Preview verification on 2026-11-14: the featured Movie `Heartland` (`5208317557966521112`) returned a provider stream and played in the browser for 3.27 seconds (`readyState: 4`); later requests to the same title returned a 480p fallback, confirming quality availability can vary. TV episode requests at season 1, episode 1, resolution 480 returned HTTP 200 for `The Remarried Empress` (`2862720383000763928`), `Dead-End Job` (`4780148614284956296`), and `The Vampire Diaries` (`801622183708610352`). The sampled Anime ID `1611910762627219768` returned HTTP 404 and the player showed its retry state. An auto-caption response for Heartland at 480p returned 9 tracks; the browser fetched an English SRT track and the app conversion helper produced WebVTT. Repeated caption lookups varied between 200 and 404, so caption availability remains provider-dependent. Homepage data returned HTTP 200 while some separate popular-feed routes briefly returned 502/404. No signed stream or caption URL was recorded.

Episode-detail fallback verification: `/tv/info/2862720383000763928` returned HTTP 502 while `/item/2862720383000763928` returned title details and a provider resource detector reporting six episodes; `/item/2862720383000763928/seasons` returned HTTP 404. ADEZ FLIX used that provider-reported count to render six numbered episode links and “Play first episode.” In the Watch route, season 1 episode 1 played for 2.95 seconds at `readyState: 4`, displayed seven subtitle tracks, and showed the selected English WebVTT track. `GET /live?page=1` returned HTTP 200 with no catalog items, so no current live event was available for an end-to-end stream check. No signed stream or caption URL was recorded.
