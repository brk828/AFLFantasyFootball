# AFL Fantasy Football

A static Astro dashboard for a weekly fantasy football league update. It is designed for GitHub Pages: private Yahoo credentials stay in a local or CI environment, while the built site contains only the resulting public stats.

## Local development

```sh
npm install
npm run dev
```

The dashboard currently includes the 2025 season summary imported from the shared Google Sheet. Run `npm run sync:sheet` to refresh standings and payout totals from that sheet.

## Yahoo access prerequisite

Yahoo Fantasy Sports API access requires an official access application and approval from Yahoo's sports team. Creating a baseline YDN app with only OpenID Connect or TW Auction permissions is not enough for private league data. Do not select TW Auction; its Read/Read-Write options are unrelated to fantasy football.

After approval, use a `Confidential Client` and complete the OAuth 2.0 three-legged handshake. The current static site cannot receive an OAuth callback, so use an HTTPS callback helper or tunnel. The current raw Node helper is a testing tool; a maintained wrapper such as `yfpy` should be evaluated for the production sync workflow.

## Weekly Yahoo update

1. After Yahoo approves Fantasy Sports API access, create the baseline developer application with `Confidential Client` and an HTTPS redirect URI. GitHub Pages cannot receive OAuth callbacks, so use a separately deployed HTTPS helper or an HTTPS tunnel to a local callback service.
2. Copy `.env.example` to `.env` and set `YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET`, and the exact HTTPS `YAHOO_REDIRECT_URI` registered in Yahoo.
3. Start an HTTPS tunnel to port `8787`, then run `npm run yahoo:auth` and open the printed Yahoo authorization URL.
4. The OAuth helper saves `YAHOO_ACCESS_TOKEN` and `YAHOO_REFRESH_TOKEN` to `.env`. Set `YAHOO_LEAGUE_KEY`, then run `npm run sync:weekly`.
5. Review the generated data, then run `npm run build` and publish `dist/`.

Yahoo access tokens should never be committed or exposed to client-side Astro code. The initial Yahoo sync writes raw league standings to `src/data/yahoo.json`; awards such as Best QB, best pickup, and best trade can be derived from weekly roster/activity payloads as those data fields are confirmed for the league.

For GitHub Pages deployment, add `YAHOO_ACCESS_TOKEN` and `YAHOO_LEAGUE_KEY` under the repository's **Settings > Secrets and variables > Actions**. The deploy workflow syncs Yahoo when both secrets exist and otherwise uses the checked-in snapshot. The initial OAuth client ID and secret are only needed by the local or hosted OAuth helper.

## GitHub Pages

The site is configured for the repository path `/AFLFantasyFootball`. A GitHub Actions workflow can run the sync scripts with repository secrets and deploy the resulting `dist/` directory.