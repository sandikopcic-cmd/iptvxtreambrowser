# Xtream Codes IPTV Web Player

A browser-based IPTV player where you log in with your Xtream credentials (server URL, username, password) and watch Live TV, Movies and Series.

## Screens

1. **Login (`/`)** — form for server URL, username, password. Validates against your provider and shows account status (expiry date, active connections). Credentials are stored in your browser only (localStorage), never on a server.
2. **Live TV (`/live`)** — category sidebar, searchable channel list, player pane with the current channel and now/next info from the EPG.
3. **Movies (`/vod`)** — poster grid by category, search, detail view (plot, cast, rating, year) with a Play button.
4. **Series (`/series`)** — poster grid, detail view with season/episode picker.
5. Shared top bar with tabs, search, account info, and logout (clears stored credentials).

## Playback

Xtream streams are HLS (`.m3u8`) or raw MPEG-TS. The player uses `hls.js` for HLS in every desktop browser and native playback on Safari/iOS. Controls: play/pause, volume, fullscreen, picture-in-picture, and an error/retry state.

Note upfront: some providers deliver live channels only as MPEG-TS, which browsers cannot play natively. Where the provider offers an HLS variant we use it automatically; where it does not, that channel will show a clear "format not supported by browsers" message rather than silently failing. Movies and series (MP4/MKV) generally play fine.

## Why a server proxy is needed

Your IPTV server does not send CORS headers, so the browser cannot call it directly — this is the main reason web players fail. All Xtream API calls (`player_api.php`) and stream requests go through server-side endpoints in this app that forward the request and stream the response back. This also keeps your password out of page URLs.

## Technical notes

- `src/lib/xtream.functions.ts` — `createServerFn` wrappers for the Xtream API: `login` (`player_api.php` account info), `getCategories`, `getStreams`, `getVodInfo`, `getSeriesInfo`, `getShortEpg`. Credentials are passed per call from the client and validated with Zod; nothing is persisted server-side.
- `src/routes/api/public/stream/$.ts` — streaming proxy route. Takes the target stream URL (signed/encoded), forwards `Range` headers, and pipes the upstream response with proper content-type; rewrites `.m3u8` playlist segment URLs to route back through the proxy.
- `src/lib/useXtreamAuth.ts` — client hook holding credentials in localStorage, read after hydration to avoid SSR mismatch; unauthenticated visits to `/live`, `/vod`, `/series` redirect to `/`.
- Data fetching via TanStack Query with generous `staleTime` (category/stream lists are large).
- Add `hls.js`; player component is dynamically imported client-side only.
- Dark, media-centric design system (deep neutral surfaces, single accent), tokens in `src/styles.css` — no default Tailwind grays hardcoded in components.
- Per-route `head()` metadata on each page.

## Out of scope for this first pass

Recording/DVR, multi-profile accounts, catch-up TV, and Chromecast. Can be added later.
