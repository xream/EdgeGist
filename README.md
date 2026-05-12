# EdgeGist

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/icons/edgegist-dark-192.png">
    <img src="public/icons/edgegist-192.png" alt="EdgeGist app icon" width="96" height="96">
  </picture>
</p>

[简体中文](README.zh-CN.md)

Minimal GitHub Gist-compatible API service running on Cloudflare's edge network, backed by D1 and deployed on Cloudflare Workers with static assets.

Works perfectly with the [Sub-Store](https://github.com/sub-store-org/Sub-Store) Gist sharing and backup features.

EdgeGist is API-first: deploy it, configure your owner token, and point Gist API clients at your own base URL instead of `https://api.github.com`. It also ships a single-owner Web UI at `/<owner>` for browsing, editing, import/export, and Cloudflare usage checks. The root path `/` intentionally returns `404` instead of redirecting, so the configured owner route is not exposed.

## Documentation

- [EdgeGist Automated Sync and Secure Deployment Guide (GitHub Actions)](AUTO_DEPLOY_GUIDE.md) (written in Chinese) - thanks to [lockcp](https://github.com/lockcp) for providing this document.

## Community

Join the community for discussion and updates.

👥 Group [折腾啥](https://t.me/zhetengsha_group) · 📢 Channel [折腾啥](https://t.me/zhetengsha)

## Screenshots

The Web UI supports English and Simplified Chinese. The screenshots below use Simplified Chinese so the project only needs to maintain one screenshot set.

<table>
  <tr>
    <td width="50%" valign="top" align="center">
      <img src="screenshots/readme/list.png" alt="Gist list with search, filters, pagination, stars, and highlighted content matches" width="100%">
      <br>
      <sub>Server-side search across ids, descriptions, filenames, and file contents, with filters, sorting, pagination, stars, and syntax-highlighted content matches.</sub>
    </td>
    <td width="50%" valign="top" align="center">
      <img src="screenshots/readme/detail.png" alt="Wide gist detail dashboard with file tree, diff view, and history panels" width="100%">
      <br>
      <sub>Responsive gist detail dashboard with a file tree, syntax-highlighted content, file history, file-set changes, and configurable diffs.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top" align="center">
      <img src="screenshots/readme/diff.png" alt="Compact gist detail diff view with split layout and diff controls" width="100%">
      <br>
      <sub>Diff view with current and revision raw URLs, automatic/split/unified/stacked layouts, inline-change modes, line wrapping, line numbers, backgrounds, and collapsible unchanged lines.</sub>
    </td>
    <td width="50%" valign="top" align="center">
      <img src="screenshots/readme/usage.png" alt="Cloudflare usage and quota dashboard on a compact viewport" width="100%">
      <br>
      <sub>Cached and refreshable Cloudflare Workers request, D1 row, and D1 storage usage.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top" align="center">
      <img src="screenshots/readme/login.png" alt="Owner login with username, password, remember-me, and Cloudflare Turnstile" width="100%">
      <br>
      <sub>Owner login with username/password, optional remember-me, and optional Cloudflare Turnstile.</sub>
    </td>
    <td width="50%" valign="top"></td>
  </tr>
</table>

## Current Scope

- GitHub Gist-shaped API for core gist CRUD and retained revisions.
- Single-owner authentication: bearer token for API clients, password + optional Turnstile + signed cookie for the Web UI.
- Public and secret-link visibility handling. Secret gists are hidden from anonymous list APIs but remain readable by direct URL; retained revisions follow the current gist visibility.
- D1-backed current files, retained history snapshots, and settings.
- Latest-N history retention for each file and each gist's file-change feed.
- GitHub Gist-style Web UI at `/<owner>`, `/<owner>/new`, `/<owner>/<gist_id>`, and `/<owner>/<gist_id>/<sha>` with anonymous public browsing, owner management, gist editing, file history, diff view, stars, import/export, i18n, themes, PWA install support, and Cloudflare usage/quota views.
- Root `/` returns `404` and does not redirect to the owner route. Anonymous users need to know `/<owner>` to browse public gists.
- Real single-owner star support; fork and comment surfaces remain compatibility mocks with zero social data.
- Release packaging for Cloudflare Workers, including prebuilt Worker assets.

Not in the first implementation: git repository transport, multi-user collaboration, and real social features.

## API Behavior Notes

- Owner API clients should send `Authorization: Bearer <EDGEGIST_OWNER_TOKEN>`.
- Anonymous list APIs return `public` gists only. `secret` gists are omitted from anonymous lists but can still be read anonymously when the caller knows the URL or gist id.
- Retained revisions do not have separate visibility. If the current gist is readable by direct URL, its retained revisions are readable by direct URL.
- `PATCH /gists/{gist_id}` treats `null`, empty content, and an empty file spec as file deletion. Deleting every file deletes the gist.
- Raw file endpoints serve content as `text/plain` with `nosniff`, so HTML gist files are shown as inert text.

## Development

Requirements: Bun and Node.js 22 or newer. This repository includes `.node-version` because Wrangler requires a modern Node runtime. If you use mise, run `mise install` once and your shell will pick up the project Node version automatically when you enter the repository.

```sh
bun install
bun run dev
```

`bun run dev` prepares the local environment, applies local D1 migrations, and starts the API at `http://127.0.0.1:8787/` and the Web UI at `http://127.0.0.1:8787/<owner>`. Root `/` returns `404` by design.

On first run it will:

- create `wrangler.jsonc` from `wrangler.example.jsonc` when missing;
- create or append `.dev.vars` with local development defaults;
- set `EDGEGIST_BASE_URL` to `http://127.0.0.1:8787`;
- skip Turnstile on localhost/loopback dev hosts even if Turnstile keys are configured;
- persist local D1 data under `.wrangler/state/v3`.

Useful development commands:

```sh
bun run dev:prepare
bun run dev:server
bun run test
bun run build
```

Use `bun run dev:prepare` when you only want to create local config and apply local D1 migrations. Use `bun run dev:server` when local D1 is already prepared and you only want to restart the server. `bun run build` creates the client assets, Worker script, and Workers Assets ignore file under `dist/`.

If you used an older development build before the schema stabilized and local D1 starts failing, delete `.wrangler/state/v3` and run `bun run dev:prepare` again. EdgeGist keeps source migrations clean for new installs and does not carry compatibility migrations for stale development data.

## Configuration

`wrangler.jsonc` is the deployment source of truth. Copy `wrangler.example.jsonc` to `wrangler.jsonc` and fill in the project-specific values. Do not commit `wrangler.jsonc` when it contains real credentials or account-specific IDs.

### Worker and asset fields

| Field | Required | Value |
| --- | --- | --- |
| `name` | Yes | Worker script name. For this deployment it is usually `edge-gist`. The Usage page's `Worker name` field should match this value when you want script-level request usage. |
| `compatibility_date` | Yes | Cloudflare Workers compatibility date. Keep the example value unless you intentionally update runtime behavior. |
| `main` | Yes | `./dist/_worker.js`. The build outputs the Worker script here. |
| `assets.directory` | Yes | `./dist`. Static files are uploaded as Workers Assets from this directory. |
| `assets.binding` | Yes for this project | `ASSETS`. Keep the binding name unless the Worker code is changed to use a different assets binding. |

The build copies `.assetsignore` into `dist` so `_worker.js` is not served as a static asset.

### Application variables in `vars`

| Field | Required | Value |
| --- | --- | --- |
| `EDGEGIST_OWNER_USERNAME` | Yes | Owner login username. |
| `EDGEGIST_OWNER_PASSWORD` | Yes | Owner login password. |
| `EDGEGIST_OWNER_TOKEN` | Yes | Owner access token for API/client operations. Keep it secret. |
| `EDGEGIST_BASE_URL` | Yes | Public origin with protocol, for example `https://edge-gist.sbfm.eu.org`. Use the final Workers custom domain, not a Pages URL. |
| `EDGEGIST_HISTORY_MAX_VERSIONS` | Optional | Number of retained history entries per file and file-change records per gist. Defaults to `100`. |
| `EDGEGIST_TURNSTILE_SITE_KEY` | Optional | Cloudflare Turnstile site key. Leave blank to disable Turnstile. |
| `EDGEGIST_TURNSTILE_SECRET_KEY` | Optional | Cloudflare Turnstile secret key. Required only when the site key is set. |

Local development can use `.dev.vars`. Production reads values from `wrangler.jsonc` `vars` during deploy.

### D1 binding in `d1_databases`

| Field | Required | Value |
| --- | --- | --- |
| `binding` | Yes | Must be `DB`. The backend reads the database from `c.env.DB`. |
| `database_name` | Yes | D1 database display name, usually `edge-gist`. |
| `database_id` | Yes | D1 database UUID from `wrangler d1 create` or the Cloudflare dashboard. This is an ID, not the database name. |

Use the same D1 database UUID in the app's Cloudflare Usage settings when you want D1 usage and quota data.

### Custom domain

A custom domain can be attached in either place:

1. In `wrangler.jsonc` before deploy:

```jsonc
{
  "routes": [
    { "pattern": "edge-gist.sbfm.eu.org", "custom_domain": true }
  ]
}
```

2. Manually in the Cloudflare dashboard: Workers & Pages -> select the Worker -> Settings -> Domains & Routes -> Add -> Custom Domain.

Cloudflare requires the hostname to be in a Cloudflare zone you control. If Wrangler fails to create the custom domain because of DNS or token permissions, deploy the Worker first, then attach the domain manually in the dashboard.

No KV, R2, Queues, or Workers Sites configuration is required for this project.
## Command-Line Deployment

This project deploys to Cloudflare Workers with Workers Assets. Use `wrangler deploy`; do not use `wrangler pages deploy`.

### Fresh deployment

Prerequisites: Bun, Node.js compatible with this project, Wrangler 4+, and access to the target Cloudflare account.

1. Install dependencies:

```bash
bun install
```

2. Create the D1 database and record the returned UUID:

```bash
bun run db:create
```

3. Create the production Wrangler config:

```bash
cp wrangler.example.jsonc wrangler.jsonc
```

4. Edit `wrangler.jsonc`:

| Area | What to set |
| --- | --- |
| Worker | `name`, normally `edge-gist`. |
| Owner auth | `EDGEGIST_OWNER_USERNAME`, `EDGEGIST_OWNER_PASSWORD`, and `EDGEGIST_OWNER_TOKEN`. |
| Public URL | `EDGEGIST_BASE_URL`, for example `https://edge-gist.sbfm.eu.org`. |
| D1 | `d1_databases[0].database_id` with the D1 UUID. Keep `binding` as `DB`. |
| Custom domain | Optional `routes` entry with `{ "pattern": "your-domain.example.com", "custom_domain": true }`. |
| Turnstile | Optional site key and secret key. Set both or leave both blank. |

5. Apply database migrations to the remote D1 database:

```bash
bun run db:migrate:remote
```

6. Build the Worker and static assets:

```bash
bun run build
```

7. Deploy:

```bash
bun run deploy
```

If you are not logged in with Wrangler, provide a token for this command only:

```bash
CLOUDFLARE_API_TOKEN=<token> bun run deploy
```

8. If you did not configure `routes`, attach the custom domain manually in the Cloudflare dashboard. After the domain is active, make sure `EDGEGIST_BASE_URL` matches that URL and redeploy if you changed it.

### Manual Cloudflare Workers deployment from a release package

Use this path when you download `edgegist-package.zip` and do not want to build locally.

1. Unzip `edgegist-package.zip`.
2. Create or select a D1 database in Cloudflare.
3. Run the SQL files in `migrations/` against that D1 database, in filename order.
4. Copy `wrangler.example.jsonc` to `wrangler.jsonc` inside the extracted package.
5. Fill in the same fields described in the Configuration section: owner auth, `EDGEGIST_BASE_URL`, D1 `database_id`, optional Turnstile, and optional `routes`.
6. Deploy with Wrangler 4+:

```bash
wrangler deploy
```

Or, without a globally installed Wrangler:

```bash
npx wrangler@^4 deploy
```

The release package already contains `dist/_worker.js` and static assets, so no build command is required.

### Manual Cloudflare dashboard steps

Some operations are intentionally manual or account-specific:

| Operation | Where |
| --- | --- |
| Create API tokens | Cloudflare dashboard -> My Profile -> API Tokens. |
| Create D1 database | Cloudflare dashboard -> Workers & Pages -> D1, or `bun run db:create`. |
| Apply migrations manually | Cloudflare dashboard -> D1 -> database -> Console. |
| Attach custom domain | Cloudflare dashboard -> Workers & Pages -> Worker -> Settings -> Domains & Routes. |
| Configure Usage page fields | Edge Gist app -> Settings -> Cloudflare Usage. |

## Usage And Quota

The Cloudflare Usage page is configured from the app UI and stored in D1. These fields are not deployment variables in `wrangler.jsonc`.

### Required Cloudflare fields in the app

| UI field | Required | Value |
| --- | --- | --- |
| `Account ID` | Yes | Cloudflare account ID that owns the Worker and D1 database. |
| `API token` | Yes | Cloudflare API token used only for reading usage data. Required permissions are `Account Analytics Read` and `D1 Read`. |
| `Worker name` | Optional for account total, required for current-Worker usage | Worker script name, usually the `name` from `wrangler.jsonc`, for example `edge-gist`. If blank or wrong, account total usage can still load, but the `This Worker requests` value will be unavailable or zero. |
| `D1 database ID` | Yes for D1 usage | D1 database UUID. The database name is not accepted here. |
| `Workers plan` | Yes | Select `Free` or `Paid` so the UI can use the correct Workers request quota. |
| `D1 plan` | Yes | Select `Free` or `Paid` so the UI can use the correct D1 row/storage quotas. |

### What the Usage page shows

| Section | Meaning |
| --- | --- |
| Workers requests | Account-level Workers request quota usage for the displayed usage window. The total includes Workers script invocations and legacy Pages Functions invocations when Cloudflare reports them, because Cloudflare's quota dashboard can include both. |
| This Worker requests | Requests for the configured `Worker name` only. This is useful for seeing how much of the account total came from this app. |
| Workers account requests | Account-level Workers script invocations. |
| Pages Functions requests | Legacy Pages Functions requests, shown only when Cloudflare reports a non-zero value. |
| Errors | Combined error count for the Workers/Pages Functions usage window. |
| D1 database usage | Read queries, write queries, rows read, rows written, and database size for the configured D1 database ID. |

Usage windows are displayed with the browser's `toLocaleString()` formatting. The Usage page caches the last successful response in D1 so the dashboard can still show recent data if Cloudflare's API is temporarily unavailable.

Cloudflare analytics can lag behind real time. Small differences from the Cloudflare dashboard are expected when the dashboard and the app use slightly different aggregation windows or when Cloudflare has not finished processing the latest data.

### Cloudflare Workers limits that affect EdgeGist

Limits below were checked against Cloudflare's official docs on 2026-05-11. Cloudflare can change these values; use the linked docs as the source of truth: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Workers Static Assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

| Workers limit | Free | Paid / Standard | EdgeGist consequence |
| --- | --- | --- | --- |
| Worker requests | 100,000/day | No fixed hard limit; Standard includes 10 million/month, then overage billing applies | Dynamic routes such as API calls, `/<owner>`, gist detail pages, login, imports, exports, and usage refreshes count as Worker requests. When the Free daily limit is exhausted, dynamic routes can fail. Static asset requests are free and unlimited when they do not invoke the Worker; this project routes `/static/*`, `/icons/*`, and `/screenshots/*` directly to Assets. |
| CPU time per HTTP request | 10 ms | 30 seconds by default, configurable up to 5 minutes | Free-plan deployments should stay personal and light. Large searches, imports, exports, syntax payload preparation, or huge history reads may need Workers Paid even when D1 storage is still available. |
| Memory per isolate | 128 MB | 128 MB | Very large request/response bodies, full export/import payloads, or many large files in one view can exhaust runtime memory before D1 storage is full. |
| Subrequests per invocation | 50 | 10,000 | D1 operations and external Cloudflare API calls consume the same per-request budget. EdgeGist chunks D1 writes around the 100-parameter limit, but one API call still cannot perform unlimited D1 work. |
| Simultaneous outgoing connections per invocation | 6 | 6 | The Cloudflare Usage page makes only a small number of parallel Cloudflare API calls. Avoid adding fan-out behavior that waits on more than six new outbound connections at once. |
| URL size | 16 KB | 16 KB | Raw URLs include owner, gist id, optional revision sha, and filename. Extremely long filenames or query strings can be rejected before reaching EdgeGist. |
| Request headers / response headers | 128 KB total / 128 KB total | 128 KB total / 128 KB total | Owner tokens and cookies must stay small. Do not add large metadata to headers. |
| Request body size | Cloudflare account Free/Pro: 100 MB; Business: 200 MB; Enterprise: 500 MB by default | Same Cloudflare account-plan limits | This is the outer upload/import ceiling. EdgeGist's per-file D1 limit is much smaller, so a request can be under Cloudflare's body limit and still fail validation. |
| Response body size | No Worker-enforced limit; CDN cache object limits still apply: 512 MB on Free/Pro/Business accounts and 5 GB on Enterprise | Same Cloudflare account-plan limits | Large exports can stream back through Workers, but practical CPU, memory, client connection, and D1 query limits still apply. |
| Incoming HTTP wall time | No hard limit while the client remains connected; `waitUntil()` can extend work up to 30 seconds after disconnect | Same | Long imports/exports/searches depend on the client connection staying open. EdgeGist does not have a background queue, so do not rely on a request continuing indefinitely after the client disconnects. |
| Environment variables | 64 variables/Worker, 5 KB each | 128 variables/Worker, 5 KB each | Keep `vars` limited to owner auth, base URL, retention, and optional Turnstile. Do not store large configuration blobs or token lists in Worker variables. |
| Worker bundle size | 3 MB gzip, 64 MB uncompressed | 10 MB gzip, 64 MB uncompressed | The generated `dist/_worker.js` must stay small enough for the target plan. Large libraries should remain in static assets or be avoided. |
| Startup time | 1 second | 1 second | Avoid expensive global-scope initialization; deployment can fail if the Worker cannot parse and initialize quickly. |
| Workers per account | 100 | 500 | EdgeGist normally uses one Worker. This only matters when the same Cloudflare account hosts many Workers. |
| Cron Triggers per account | 5 | 250 | EdgeGist does not require Cron Triggers. Future background jobs would consume this account-level quota. |
| Routes and custom domains | 1,000 routes/zone, 100 custom domains/zone, 1,000 routed zones/Worker | Same | A normal EdgeGist deployment uses one custom domain or one route. Very large multi-domain setups should use wildcard routes or a different architecture. |
| Cache API | 512 MB max object, 50 calls/request | 512 MB max object, 1,000 calls/request | EdgeGist does not require Cache API for correctness. Do not rely on Cache API as primary gist storage. |
| Logs | 256 KB log data/request | 256 KB log data/request | Do not log gist file contents, import/export payloads, owner tokens, or Cloudflare API responses. Logs can be truncated and may expose secrets. |
| Static Assets | 20,000 files/Worker version, 25 MiB/file, 100 `_headers` rules, 2,000 characters per `_headers` line, 2,000 static `_redirects`, 100 dynamic `_redirects`, 2,100 redirects total, 1,000 characters per redirect rule | 100,000 files/Worker version, same per-file/header/redirect limits | The built `dist/` assets and release package must stay below these limits. A single generated client asset over 25 MiB cannot be uploaded as a Worker asset. EdgeGist does not currently depend on `_redirects`. |
| Legacy Bundled / Unbound usage models | Deprecated for new accounts | Deprecated for new accounts | If an old account still uses Bundled, expect Paid-like limits except Bundled keeps 50 subrequests/request, 50 ms HTTP CPU, 50 ms Cron CPU, and 50 Cache API calls/request. Move to Standard when possible. |

### Cloudflare D1 limits that affect EdgeGist

| D1 limit | Free | Paid | EdgeGist consequence |
| --- | --- | --- | --- |
| Databases per account | 10 | 50,000 | EdgeGist needs one D1 database. Extra staging or per-tenant databases count against the same account quota. |
| Maximum database size | 500 MB | 10 GB | EdgeGist stores current files, retained revision snapshots, settings, and usage cache in D1. Large files and high `EDGEGIST_HISTORY_MAX_VERSIONS` values consume this quickly. The paid 10 GB per-database hard limit cannot be increased. |
| Maximum storage per account | 5 GB | 1 TB | Multiple D1 databases share this account-level cap. On Paid, D1 billing includes the first 5 GB and then charges for additional stored GB-months. |
| Rows read / rows written included usage | 5 million rows read/day; 100,000 rows written/day | First 25 billion rows read/month and 50 million rows written/month included, then overage billing | Listing, searching, importing, exporting, editing, retention cleanup, and usage-cache writes all consume D1 rows. D1 counts rows scanned, not just rows returned, so content search can consume many reads when the database grows. |
| Time Travel duration | 7 days | 30 days | D1 Time Travel is a database backup window, not the same as EdgeGist retained revisions. EdgeGist history is controlled by `EDGEGIST_HISTORY_MAX_VERSIONS`. |
| Time Travel restore rate | 10 restores / 10 minutes / database | Same | Disaster recovery via D1 restore is rate-limited. |
| Queries per Worker invocation | 50 | 1,000 | One API request cannot issue unlimited D1 queries. Large import/export/history operations should be kept bounded and may require Workers Paid. |
| Columns per table | 100 | 100 | Current EdgeGist tables are far below this. Future schema changes should avoid wide metadata tables. |
| Rows per table | Unlimited, subject to storage | Unlimited, subject to storage | Row count is not the direct cap; storage, query duration, row reads, and single-database throughput become the practical limits. |
| String, `BLOB`, or table row size | 2,000,000 bytes | 2,000,000 bytes | EdgeGist rejects file content larger than 2,000,000 bytes. Because D1 also caps full row size, keep individual files comfortably below 2 MB when filenames or metadata are large. |
| SQL statement length | 100 KB | 100 KB | Generated queries and migrations must stay compact. EdgeGist chunks multi-row statements instead of generating one huge statement. |
| Bound parameters per query | 100 | 100 | EdgeGist chunks file/version inserts and deletes to stay under this D1 cap. Requests with many files can still require many D1 statements. |
| SQL function arguments | 32 | 32 | Avoid future features that generate large variadic SQL functions. |
| `LIKE` / `GLOB` pattern length | 50 bytes | 50 bytes | EdgeGist search uses `LIKE '%query%'`; keep search terms short. Escaping and the surrounding `%` characters also count toward the pattern. |
| D1 bindings per Worker script | Approximately 5,000 | Approximately 5,000 | EdgeGist uses one binding named `DB`. This is not a practical limit unless the architecture changes to many bound databases. |
| SQL query duration | 30 seconds | 30 seconds | Full content scans, large exports, and retention cleanup must finish quickly. If they do not, split the work or reduce stored history/data size. |
| `wrangler d1 execute` import file size | 5 GB | 5 GB | Manual migration/import files run through Wrangler must stay below 5 GB. EdgeGist release migrations are expected to be much smaller. |
| Batch statements | Individual query limits still apply to each statement inside a batch | Same | A batch does not bypass the 100-parameter, 100 KB SQL, row-size, or query-duration limits. |
| Per-database concurrency | One D1 database processes queries one at a time and queues excess work | Same | EdgeGist is best suited for personal or low-concurrency single-owner usage. Heavy concurrent edits, imports, exports, or content searches can queue and eventually return D1 overloaded errors. |

> [!NOTE]
> For Gist-compatible sync tools that do not need full GitHub response metadata, use the `/lite` API prefix to reduce response size and avoid hydrating response history. For example, if a client currently points at `https://api.example.com`, configure it to use `https://api.example.com/lite`. The same Gist paths continue to work under the prefix.
>
> If you are close to D1 storage, row-write, or Worker CPU limits and do not need EdgeGist retained revisions, set `EDGEGIST_HISTORY_MAX_VERSIONS` to `0`. With `0`, EdgeGist does not record history versions for new create/update requests.

### Practical EdgeGist limits

- Keep each file below 2 MB. The app enforces `2,000,000` bytes per file content because D1 caps strings and rows at that size.
- Keep search terms short. D1 caps `LIKE` patterns at 50 bytes, and EdgeGist wraps the search query in `%...%`.
- Keep the retained history count intentional. Every retained version stores file snapshots in D1, so storage grows with `file size * retained versions`, plus current files and change metadata. Set `EDGEGIST_HISTORY_MAX_VERSIONS=0` only when you intentionally want new writes to skip EdgeGist history recording.
- On Workers Free, treat EdgeGist as a personal deployment: 100,000 dynamic Worker requests/day, 10 ms CPU/request, 50 subrequests/request, 500 MB maximum D1 database size, 5 million rows read/day, and 100,000 rows written/day.
- On Workers Paid, the important ceilings become cost and per-database scale: 10 million Worker requests/month included, 30 million CPU milliseconds/month included, 10 GB maximum D1 database size, 25 billion rows read/month included, and 50 million rows written/month included.
- On D1 Free, exceeding daily read/write limits stops D1 queries until the daily reset; hitting the storage limit requires deleting data or upgrading before new writes/schema changes can continue. On D1 Paid, usage above included reads, writes, or storage is billed.
- Static assets are not the same as dynamic app/API routes. `/static/*`, `/icons/*`, and `/screenshots/*` are served as assets, but the API and owner pages invoke the Worker and count toward Worker limits.
- EdgeGist stores data only in D1. It does not use R2/KV for large object storage, so it is not a good fit for binary blobs, huge archives, or Git-style repository transport.

## Updating

### Git-based deployment

1. Pull the latest source.
2. Run `bun install` if dependencies changed.
3. Review `wrangler.example.jsonc` for newly added fields and copy them into your private `wrangler.jsonc` without overwriting real credentials or IDs.
4. Run any new D1 migrations with `bun run db:migrate:remote`.
5. Run `bun run build`.
6. Deploy with `bun run deploy`.

### Release-package deployment

1. Download and unzip the latest `edgegist-package.zip`.
2. Copy your existing `wrangler.jsonc` into the extracted package.
3. Review `wrangler.example.jsonc` for newly added fields and add missing values to your copied config.
4. Run any new SQL files in `migrations/` against your D1 database.
5. Deploy with `wrangler deploy` or `npx wrangler@^4 deploy`.

After updates that touch Cloudflare usage, open Settings -> Cloudflare Usage and confirm the saved `Account ID`, `Worker name`, `D1 database ID`, and plan selections still match your Cloudflare account.

## Cloudflare Account API Token For Deployment

For local or CI deployment with `CLOUDFLARE_API_TOKEN`, create a Cloudflare API token scoped to the target account.

Minimum permissions for the deploy flow:

| Permission | Why |
| --- | --- |
| `Workers Scripts Edit` | Upload and update the Worker script and assets with `wrangler deploy`. |
| `D1 Edit` | Create D1 databases and apply remote D1 migrations when using Wrangler commands. |

If the same token is also used in the app's Cloudflare Usage settings, add:

| Permission | Why |
| --- | --- |
| `Account Analytics Read` | Read Workers and D1 analytics through Cloudflare GraphQL. |
| `D1 Read` | Read D1 database metadata, including database size. |

For custom domains configured through `routes`, the token must also be allowed to operate on the Cloudflare zone that owns the hostname. If that fails, deploy the Worker without `routes` and add the custom domain manually in the Cloudflare dashboard.

Recommended CI secrets:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Deployment token. |
| `CLOUDFLARE_ACCOUNT_ID` | Target Cloudflare account ID. |

Do not put Cloudflare API tokens in `wrangler.jsonc`, README files, or committed source files.
## GitHub Releases

Bump `package.json` version and merge or push that change to the default branch to cut a release. The Release workflow can also be run manually from GitHub Actions.

The workflow reads `package.json` for the package name and version, uses `v${version}` as the release tag, fails if that release already exists or if the tag points at a different commit, then runs tests, builds, packages, generates conventional release notes, creates the tag when needed, and publishes:

- `edgegist-package.zip`: README files, migrations, example config, prebuilt Worker script, and static assets.
- `SHA256SUMS`: checksums for release assets.

## API Compatibility

Supported GitHub Gist-compatible REST surface:

- `GET /gists`, `GET /gists/public`, and `GET /users/{username}/gists`.
- `POST /gists`, `GET /gists/{gist_id}`, `PATCH /gists/{gist_id}`, and `DELETE /gists/{gist_id}`.
- `GET /gists/{gist_id}/commits` and `GET /gists/{gist_id}/{sha}` for retained file revisions.
- Current raw files through `GET /gists/{gist_id}/raw/{filename}` and GitHub-style `GET /{owner}/{gist_id}/raw/{filename}`.
- Retained raw files through `GET /gists/{gist_id}/raw/{sha}/{filename}` and GitHub-style `GET /{owner}/{gist_id}/raw/{sha}/{filename}`.
- Star endpoints: `GET /gists/starred`, `GET /gists/{gist_id}/star`, `PUT /gists/{gist_id}/star`, and `DELETE /gists/{gist_id}/star`.

Compatibility mocks:

- `GET /gists/{gist_id}/comments`, comment mutation endpoints, and fork endpoints exist for client compatibility, but return empty or no-op responses.

Unsupported:

- Git transport (`git clone`, `git push`, `git pull` against a gist repository) is not implemented.

## Related Projects

- [LiteGist](https://github.com/lockcp/LiteGist)

  > LiteGist is an extremely lightweight, experience-focused personal standalone pastebin service. Designed with a full-screen editor philosophy, it supports Markdown rendering, code highlighting, password protection, Gist-compatible multi-file management, and PWA support. It aims to provide you with a high-performance "Private Gist" sharing experience.
