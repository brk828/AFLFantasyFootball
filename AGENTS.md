# AFL Fantasy Football Agent Notes

## Project shape

- Astro static site; keep page behavior build-time and compatible with GitHub Pages.
- `src/data/league.json` is the curated public snapshot used by the homepage.
- `scripts/` contains weekly data import scripts. Never put Yahoo credentials in `src/`.
- Use `npm run build` as the required verification command after changes.

## Weekly workflow

Run `npm run sync:sheet` for payout and standings data. Do not run the Yahoo sync until Yahoo has approved Fantasy Sports API access for the account and the authorized app can access private league data. Review generated changes before publishing.

## Yahoo linkage setup

- **Access approval comes first.** Submit Yahoo's official Fantasy Sports API access application and wait for the Yahoo sports team to approve the account. A baseline YDN application that only offers OpenID Connect or TW Auction permissions cannot authorize this site's Fantasy Sports API requests.
- After approval, create the baseline Yahoo developer application and use a `Confidential Client` for the server-side OAuth helper. Do not select TW Auction; its Read/Read-Write choices are unrelated to fantasy league data.
- Complete the OAuth 2.0 three-legged handshake. Private fantasy league data requires user authorization; a two-legged client-credentials flow is insufficient. Yahoo requires an HTTPS redirect URI; do not use `http://localhost`.
- Because GitHub Pages is static and cannot receive an OAuth callback, use a small HTTPS callback service or an HTTPS tunnel to a local OAuth helper. Register the exact tunnel URL, such as `https://<tunnel-host>/oauth/callback`, in the Yahoo app.
- The current raw Node OAuth helper is retained for testing only. Once access is approved, prefer a maintained Yahoo Fantasy API wrapper such as `yfpy` in a separate sync service or script, then feed its normalized output into `src/data/league.json`.
- Do not paste client secrets or tokens into source files, `src/data/`, chat, or git.
- A local callback helper is available with `npm run yahoo:auth`. It listens on port `8787`; expose it through an HTTPS tunnel such as Cloudflare Tunnel, set the resulting exact `https://.../oauth/callback` URL as `YAHOO_REDIRECT_URI`, and register that same URL in Yahoo.
- The helper saves tokens to `.env` with restrictive permissions and only prints a masked confirmation. Run `npm run sync:yahoo` afterward.
- Identify the league key for the 2026 league. It normally looks like `<game_key>.l.<league_id>` and can be found from Yahoo Fantasy API league metadata or the league URL after authentication.
- Copy `.env.example` to `.env` and set `YAHOO_ACCESS_TOKEN` and `YAHOO_LEAGUE_KEY` locally.
- After approval and a successful authorized API request, run the Yahoo sync; it should fetch standings from Yahoo and update `src/data/league.json` and `src/data/yahoo.json`.
- Run `npm run sync:sheet` separately for payout history and transaction counts. The Yahoo sync preserves those financial fields and calculates transaction cost as `transactionCount * transactionFee`.
- Run `npm run build`, review generated data, and publish `dist/`.

Yahoo access tokens expire and may require refresh through the OAuth flow. For GitHub Actions, store `YAHOO_ACCESS_TOKEN` and `YAHOO_LEAGUE_KEY` as repository or environment secrets; the Pages workflow uses them when both are present and otherwise builds the checked-in snapshot. The client ID and client secret are needed by the initial OAuth helper, not by the current standings sync. Never commit `.env` or generated private API responses.

### New Yahoo app confirmation pending

A new Yahoo developer app was created for Fantasy Sports API access, but Yahoo requires a separate "Confirm Your Yahoo Fantasy Sports API Application" step (an email/dashboard confirmation) after app creation before `oauth2/request_auth` will work; requests made before confirmation fail immediately with a generic Yahoo error page. Remaining steps once that confirmation arrives:

1. Start a fresh HTTPS tunnel (the previous quick Cloudflare tunnel URL is not durable and will have expired): `cloudflared tunnel --url http://localhost:8787`.
2. Copy the new `https://<tunnel-host>/oauth/callback` URL and update the **Redirect URI** in the Yahoo app's settings to match exactly.
3. Update `YAHOO_REDIRECT_URI` in `.env` to the same new URL.
4. Run `npm run yahoo:auth` again to print a fresh authorization URL (it embeds the client ID, redirect URI, and a new state value, so a stale printed URL from an earlier run cannot be reused).
5. Open the printed authorization URL, log in, and click Agree. Confirm the helper reports tokens saved to `.env`.
6. Set `YAHOO_LEAGUE_KEY`, then run `npm run sync:yahoo`, `npm run sync:sheet`, and `npm run build`, reviewing generated data before publishing.

## Yahoo implementation plan

1. Submit and obtain approval for Yahoo Fantasy Sports API access.
2. Validate three-legged OAuth against the approved app and private 2026 league.
3. Evaluate `yfpy` or another maintained wrapper in an isolated sync tool; keep credentials and wrapper-specific response handling out of Astro pages.
4. Normalize standings, weekly player stats, roster moves, pickups, and trades into public JSON snapshots.
5. Add Best QB, best pickup, and best trade awards only after the corresponding Yahoo data is available and verified.
6. Keep the Google Sheet importer for historical payouts and league accounting; merge it with Yahoo data during the weekly build.