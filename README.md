# EdgeGist

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/icons/edgegist-dark-192.png">
    <img src="public/icons/edgegist-192.png" alt="EdgeGist 应用图标" width="96" height="96">
  </picture>
</p>


EdgeGist 是一个运行在 Cloudflare edge network 上的 GitHub Gist API 兼容服务，使用 D1 存储，并部署到带 static assets 的 Cloudflare Workers。

能与 [Sub-Store](https://github.com/sub-store-org/Sub-Store) 的 Gist 分享和备份功能完美配合。

它的目标是 API-first：部署后配置自己的 owner token，把支持自定义 API base URL 的 Gist 客户端从 `https://api.github.com` 换成你的 EdgeGist 地址即可使用。同时它也提供 `/<owner>` 单 owner Web UI，用于浏览、编辑、导入导出和查看 Cloudflare 用量。根路径 `/` 会有意返回 `404`，不会自动跳转，从而避免暴露已配置的 owner route。

## 社群

👏🏻 欢迎加入社群进行交流讨论

👥 群组 [折腾啥(群组)](https://t.me/zhetengsha_group) · 📢 频道 [折腾啥(频道)](https://t.me/zhetengsha)

## 界面截图

<table>
  <tr>
    <td width="50%" valign="top" align="center">
      <img src="screenshots/readme/list.png" alt="支持搜索、筛选、分页、star 和内容匹配高亮的 gist 列表" width="100%">
      <br>
      <sub>后端搜索 id、description、文件名和文件内容，支持筛选、排序、分页、star，以及带语法高亮的内容匹配片段。</sub>
    </td>
    <td width="50%" valign="top" align="center">
      <img src="screenshots/readme/detail.png" alt="带文件树、diff view 和历史面板的宽屏 gist 详情 dashboard" width="100%">
      <br>
      <sub>响应式 gist 详情 dashboard，包含文件树、语法高亮内容、文件历史、文件集合变更和可配置 diff。</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top" align="center">
      <img src="screenshots/readme/diff.png" alt="带 split layout 和 diff controls 的窄屏 gist 详情 diff 视图" width="100%">
      <br>
      <sub>Diff view 支持当前和历史 raw URL、自动/split/unified/stacked 布局、行内变更模式、换行、行号、背景和未修改行折叠。</sub>
    </td>
    <td width="50%" valign="top" align="center">
      <img src="screenshots/readme/usage.png" alt="紧凑视口下的 Cloudflare 用量和额度页面" width="100%">
      <br>
      <sub>缓存和可刷新的 Cloudflare Workers requests、D1 rows 和 D1 storage 用量。</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top" align="center">
      <img src="screenshots/readme/login.png" alt="带用户名、密码、记住登录和 Cloudflare Turnstile 的 owner 登录页" width="100%">
      <br>
      <sub>Owner 登录使用用户名/密码，支持记住登录状态，也可以启用 Cloudflare Turnstile。</sub>
    </td>
    <td width="50%" valign="top"></td>
  </tr>
</table>

## 当前范围

- GitHub Gist 形态的核心 CRUD API 和 retained revisions。
- 单 owner 认证：API 客户端使用 bearer token，Web UI 使用密码 + 可选 Turnstile + 签名 cookie。
- public 和 secret-link visibility。secret gists 不出现在匿名列表 API，但知道 URL 时仍可直达；历史版本跟随当前 gist visibility。
- D1 存储当前文件、历史版本快照和 settings。
- 每个文件和每个 gist 的文件变更列表都按最新 N 条保留。
- GitHub Gist 风格的 Web UI：`/<owner>`、`/<owner>/new`、`/<owner>/<gist_id>` 和 `/<owner>/<gist_id>/<sha>`；支持匿名查看公开 gist、owner 管理、gist 编辑、文件历史、diff view、star、导入导出、i18n、主题、PWA 安装，以及 Cloudflare usage/quota 页面。
- 根路径 `/` 返回 `404`，不会跳转到 owner route。匿名用户需要知道 `/<owner>` 才能浏览公开 gist。
- 单 owner star 支持；fork、comment 仍为兼容 mock，永远不保存真实社交数据。
- 面向 Cloudflare Workers 的 release packaging，包含预构建 Worker assets。

暂不包含：git repository transport、多用户协作、真实社交功能。

## API 行为说明

- Owner API 客户端应发送 `Authorization: Bearer <EDGEGIST_OWNER_TOKEN>`。
- 匿名列表 API 只返回 `public` gists。`secret` gists 不出现在匿名列表里，但知道 URL 或 gist id 时仍可匿名读取。
- 历史版本没有独立 visibility。如果当前 gist 可以通过直达 URL 读取，它的 retained revisions 也可以通过直达 URL 读取。
- `PATCH /gists/{gist_id}` 中，`null`、空 content、空文件 spec 都表示删除该文件。删除所有文件会删除整个 gist。
- Raw file endpoint 会以 `text/plain` 和 `nosniff` 返回内容，所以 HTML gist 文件会作为 inert text 展示。

## 开发

需要 Bun 和 Node.js 22 或更高版本。本仓库带有 `.node-version`，因为 Wrangler 需要较新的 Node runtime。如果你使用 mise，先执行一次 `mise install`，之后进入仓库时 shell 会自动切到项目指定的 Node 版本。

```sh
bun install
bun run dev
```

`bun run dev` 会准备本地环境、执行 local D1 migration，并在 `http://127.0.0.1:8787/` 启动 API、在 `http://127.0.0.1:8787/<owner>` 启动 Web UI。根路径 `/` 按设计返回 `404`。

首次运行时它会：

- 缺少 `wrangler.jsonc` 时，从 `wrangler.example.jsonc` 创建一份；
- 创建或补齐 `.dev.vars` 的本地开发默认值；
- 把 `EDGEGIST_BASE_URL` 设置为 `http://127.0.0.1:8787`；
- localhost/loopback dev host 下总是跳过 Turnstile，即使配置了 Turnstile keys；
- 把 local D1 数据持久化到 `.wrangler/state/v3`。

常用开发命令：

```sh
bun run dev:prepare
bun run dev:server
bun run test
bun run build
```

只想创建本地配置并执行 local D1 migration 时，用 `bun run dev:prepare`。local D1 已经准备好、只想重启服务时，用 `bun run dev:server`。`bun run build` 会把 client assets、Worker script 和 Workers Assets ignore 文件输出到 `dist/`。

如果你在 schema 稳定前跑过旧开发版本，本地 D1 开始报错，可以删除 `.wrangler/state/v3` 后重新执行 `bun run dev:prepare`。EdgeGist 的源码 migration 只保留新安装需要的干净 schema，不保留兼容旧开发数据的迁移代码。

## 配置

`wrangler.jsonc` 是部署配置的唯一来源。先复制 `wrangler.example.jsonc` 到 `wrangler.jsonc`，再填写项目自己的值。真实 credentials、账号 ID、database ID 不应该提交到仓库。

### Worker 和静态资源字段

| 字段 | 是否必填 | 值 |
| --- | --- | --- |
| `name` | 是 | Worker script 名称。本项目通常是 `edge-gist`。如果要在用量页显示“当前 Worker 请求”，前端里的 `Worker 名称` 需要和这里一致。 |
| `compatibility_date` | 是 | Cloudflare Workers compatibility date。没有明确升级 runtime 行为时，沿用示例值即可。 |
| `main` | 是 | `./dist/_worker.js`。构建后的 Worker script 输出到这里。 |
| `assets.directory` | 是 | `./dist`。静态文件会从这个目录作为 Workers Assets 上传。 |
| `assets.binding` | 是 | `ASSETS`。除非同步修改 Worker 代码里的 assets binding，否则不要改。 |

构建会把 `.assetsignore` 复制到 `dist`，避免 `_worker.js` 被当成静态资源访问。

### `vars` 里的应用变量

| 字段 | 是否必填 | 值 |
| --- | --- | --- |
| `EDGEGIST_OWNER_USERNAME` | 是 | Owner 登录用户名。 |
| `EDGEGIST_OWNER_PASSWORD` | 是 | Owner 登录密码。 |
| `EDGEGIST_OWNER_TOKEN` | 是 | Owner access token，用于 API/client 操作。需要保密。 |
| `EDGEGIST_BASE_URL` | 是 | 带协议的公开 origin，例如 `https://edge-gist.sbfm.eu.org`。应该使用最终 Workers 自定义域名，不要再填 Pages URL。 |
| `EDGEGIST_HISTORY_MAX_VERSIONS` | 可选 | 每个文件保留的历史版本数量，以及每个 gist 保留的文件变更记录数量。默认 `100`。 |
| `EDGEGIST_TURNSTILE_SITE_KEY` | 可选 | Cloudflare Turnstile site key。留空表示不启用 Turnstile。 |
| `EDGEGIST_TURNSTILE_SECRET_KEY` | 可选 | Cloudflare Turnstile secret key。只有配置了 site key 时才需要。 |

本地开发可以使用 `.dev.vars`。生产环境部署时读取 `wrangler.jsonc` 里的 `vars`。

### `d1_databases` 里的 D1 绑定

| 字段 | 是否必填 | 值 |
| --- | --- | --- |
| `binding` | 是 | 必须是 `DB`。后端通过 `c.env.DB` 读取数据库。 |
| `database_name` | 是 | D1 database 显示名称，通常是 `edge-gist`。 |
| `database_id` | 是 | `wrangler d1 create` 或 Cloudflare dashboard 返回的 D1 database UUID。这里必须填 ID，不是 database name。 |

如果要在应用里的 Cloudflare 用量页展示 D1 用量，也使用同一个 D1 database UUID。

### 自定义域名

自定义域名可以用两种方式绑定：

1. 部署前写入 `wrangler.jsonc`：

```jsonc
{
  "routes": [
    { "pattern": "edge-gist.sbfm.eu.org", "custom_domain": true }
  ]
}
```

2. 在 Cloudflare dashboard 手动添加：Workers & Pages -> 选择 Worker -> Settings -> Domains & Routes -> Add -> Custom Domain。

Cloudflare 要求这个 hostname 属于你控制的 Cloudflare zone。如果 Wrangler 因为 DNS 或 token 权限无法创建 custom domain，先部署 Worker，再去 dashboard 手动绑定域名。

本项目不需要 KV、R2、Queues 或 Workers Sites 配置。
## 命令行部署

本项目部署到 Cloudflare Workers，并使用 Workers Assets 承载静态资源。部署命令是 `wrangler deploy`，不要使用 `wrangler pages deploy`。

### 首次部署

前置条件：Bun、与本项目兼容的 Node.js、Wrangler 4+、目标 Cloudflare 账号权限。

1. 安装依赖：

```bash
bun install
```

2. 创建 D1 database，并记录返回的 UUID：

```bash
bun run db:create
```

3. 创建生产 Wrangler 配置：

```bash
cp wrangler.example.jsonc wrangler.jsonc
```

4. 编辑 `wrangler.jsonc`：

| 区域 | 需要填写 |
| --- | --- |
| Worker | `name`，通常是 `edge-gist`。 |
| Owner auth | `EDGEGIST_OWNER_USERNAME`、`EDGEGIST_OWNER_PASSWORD` 和 `EDGEGIST_OWNER_TOKEN`。 |
| 公开 URL | `EDGEGIST_BASE_URL`，例如 `https://edge-gist.sbfm.eu.org`。 |
| D1 | `d1_databases[0].database_id` 填 D1 UUID。`binding` 保持 `DB`。 |
| 自定义域名 | 可选 `routes`，格式是 `{ "pattern": "your-domain.example.com", "custom_domain": true }`。 |
| Turnstile | 可选 site key 和 secret key。要么两个都填，要么两个都留空。 |

5. 把数据库迁移应用到远端 D1：

```bash
bun run db:migrate:remote
```

6. 构建 Worker 和静态资源：

```bash
bun run build
```

7. 部署：

```bash
bun run deploy
```

如果当前环境没有登录 Wrangler，可以只给这次命令传 token：

```bash
CLOUDFLARE_API_TOKEN=<token> bun run deploy
```

8. 如果没有在 `routes` 里配置域名，需要到 Cloudflare dashboard 手动绑定 custom domain。域名生效后，确认 `EDGEGIST_BASE_URL` 和最终 URL 一致；如果改过这个值，需要重新部署。

### 使用 release package 手动部署到 Cloudflare Workers

当你下载的是 `edgegist-package.zip`，并且不想在本地构建时，使用这个流程。

1. 解压 `edgegist-package.zip`。
2. 在 Cloudflare 创建或选择一个 D1 database。
3. 按文件名顺序，把 `migrations/` 里的 SQL 在这个 D1 database 上执行。
4. 在解压后的目录里复制 `wrangler.example.jsonc` 到 `wrangler.jsonc`。
5. 按“配置”章节填写 owner auth、`EDGEGIST_BASE_URL`、D1 `database_id`、可选 Turnstile、可选 `routes`。
6. 使用 Wrangler 4+ 部署：

```bash
wrangler deploy
```

如果没有全局安装 Wrangler：

```bash
npx wrangler@^4 deploy
```

release package 已经包含 `dist/_worker.js` 和静态资源，所以不需要运行 build 命令。

### 需要手动操作的 Cloudflare 项

有些操作本身就是账号级或 dashboard 级操作：

| 操作 | 位置 |
| --- | --- |
| 创建 API token | Cloudflare dashboard -> My Profile -> API Tokens。 |
| 创建 D1 database | Cloudflare dashboard -> Workers & Pages -> D1，或运行 `bun run db:create`。 |
| 手动执行 migrations | Cloudflare dashboard -> D1 -> database -> Console。 |
| 绑定 custom domain | Cloudflare dashboard -> Workers & Pages -> Worker -> Settings -> Domains & Routes。 |
| 配置用量页字段 | Edge Gist 应用 -> Settings -> Cloudflare Usage。 |
## 用量和额度

Cloudflare 用量页在应用 UI 里配置，并保存到 D1。这些字段不是 `wrangler.jsonc` 里的部署变量。

### 应用里需要填写的 Cloudflare 字段

| UI 字段 | 是否必填 | 值 |
| --- | --- | --- |
| `Account ID` | 是 | 拥有 Worker 和 D1 database 的 Cloudflare account ID。 |
| `API token` | 是 | 只用于读取用量数据的 Cloudflare API token。需要 `Account Analytics Read` 和 `D1 Read` 权限。 |
| `Worker 名称` | 账号总量不必填；当前 Worker 用量必填 | Worker script name，通常就是 `wrangler.jsonc` 里的 `name`，例如 `edge-gist`。如果留空或填错，账号总请求仍可加载，但“当前 Worker 请求”会不可用或为 0。 |
| `D1 database ID` | 查看 D1 用量时必填 | D1 database UUID。这里不支持填 database name。 |
| `Workers 套餐` | 是 | 选择 `Free` 或 `Paid`，用于计算 Workers 请求额度。 |
| `D1 套餐` | 是 | 选择 `Free` 或 `Paid`，用于计算 D1 rows/storage 额度。 |

### 用量页展示什么

| Section | 含义 |
| --- | --- |
| Workers 请求用量 | 当前用量窗口内的账号级 Workers 请求额度用量。总数会把 Workers script invocations 和 Cloudflare 返回的历史 Pages Functions invocations 合并，因为 Cloudflare 的额度页可能也会合并统计。 |
| 当前 Worker 请求 | 只统计配置的 `Worker 名称` 对应的请求，用来判断本应用在账号总量里的占比。 |
| Workers 账号请求 | 账号级 Workers script invocations。 |
| Pages Functions 请求 | 历史 Pages Functions 请求。只有 Cloudflare 返回非 0 时才展示。 |
| 错误 | 当前 Workers/Pages Functions 用量窗口内的合并错误数。 |
| D1 数据库用量 | 当前 D1 database ID 的 read queries、write queries、rows read、rows written 和 database size。 |

用量窗口按浏览器的 `toLocaleString()` 显示。用量页会把最近一次成功响应缓存到 D1；如果 Cloudflare API 短时间不可用，dashboard 仍能展示最近数据。

Cloudflare analytics 可能有延迟。只要 dashboard 和应用使用的聚合窗口不同，或 Cloudflare 还没处理完最新数据，数字就可能出现小幅差异。
## 更新

### 使用 Git 部署

1. 拉取最新源码。
2. 如果依赖变化，运行 `bun install`。
3. 对照 `wrangler.example.jsonc` 是否新增字段，把缺失字段补到自己的 `wrangler.jsonc`，不要覆盖真实 credentials 或 IDs。
4. 如果有新的 D1 migration，运行 `bun run db:migrate:remote`。
5. 运行 `bun run build`。
6. 运行 `bun run deploy`。

### 使用 release package 部署

1. 下载并解压最新的 `edgegist-package.zip`。
2. 把已有的 `wrangler.jsonc` 复制到解压目录。
3. 对照 `wrangler.example.jsonc` 是否新增字段，把缺失值补齐。
4. 如果 `migrations/` 里有新的 SQL 文件，在你的 D1 database 上执行。
5. 运行 `wrangler deploy` 或 `npx wrangler@^4 deploy`。

如果更新涉及 Cloudflare 用量功能，打开 Settings -> Cloudflare Usage，确认保存的 `Account ID`、`Worker 名称`、`D1 database ID` 和套餐选择仍然匹配当前 Cloudflare 账号。

## Cloudflare 账户 API Token 用于部署

如果本地或 CI 用 `CLOUDFLARE_API_TOKEN` 部署，建议创建一个只作用于目标账号的 Cloudflare API token。

部署流程的最低权限：

| 权限 | 用途 |
| --- | --- |
| `Workers Scripts Edit` | 使用 `wrangler deploy` 上传和更新 Worker script 与 assets。 |
| `D1 Edit` | 使用 Wrangler 创建 D1 database 或应用远端 D1 migrations。 |

如果同一个 token 也要填到应用里的 Cloudflare 用量设置，需要再加：

| 权限 | 用途 |
| --- | --- |
| `Account Analytics Read` | 通过 Cloudflare GraphQL 读取 Workers 和 D1 analytics。 |
| `D1 Read` | 读取 D1 database metadata，包括 database size。 |

如果通过 `routes` 配置 custom domain，这个 token 还必须能操作 hostname 所属的 Cloudflare zone。如果这一步失败，先去掉 `routes` 部署 Worker，再到 Cloudflare dashboard 手动添加 custom domain。

推荐的 CI secrets：

| Secret | 值 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 部署 token。 |
| `CLOUDFLARE_ACCOUNT_ID` | 目标 Cloudflare account ID。 |

不要把 Cloudflare API token 写进 `wrangler.jsonc`、README 或任何会提交的源码文件。
## GitHub Releases

修改 `package.json` 里的 version，并把这个变更合并或推送到默认分支即可发布。Release workflow 也可以在 GitHub Actions 里手动触发。

Workflow 会读取 `package.json` 的 package name 和 version，使用 `v${version}` 作为 release tag；如果对应 release 已存在，或已有 tag 指向了其他 commit，会直接失败。随后它会运行测试、build、package、用 conventional changelog 生成 release notes，在需要时创建 tag，并发布：

- `edgegist-package.zip`: README、migration、example 配置、预构建 Worker script 和 static assets。
- `SHA256SUMS`: release assets 的校验值。

## API 兼容性

已支持的 GitHub Gist 兼容 REST surface：

- `GET /gists`、`GET /gists/public` 和 `GET /users/{username}/gists`。
- `POST /gists`、`GET /gists/{gist_id}`、`PATCH /gists/{gist_id}` 和 `DELETE /gists/{gist_id}`。
- `GET /gists/{gist_id}/commits` 和 `GET /gists/{gist_id}/{sha}`，用于访问保留的文件历史版本。
- 当前 raw 文件：`GET /gists/{gist_id}/raw/{filename}` 和 GitHub 风格的 `GET /{owner}/{gist_id}/raw/{filename}`。
- 历史 raw 文件：`GET /gists/{gist_id}/raw/{sha}/{filename}` 和 GitHub 风格的 `GET /{owner}/{gist_id}/raw/{sha}/{filename}`。
- Star endpoints：`GET /gists/starred`、`GET /gists/{gist_id}/star`、`PUT /gists/{gist_id}/star` 和 `DELETE /gists/{gist_id}/star`。

兼容 mock：

- `GET /gists/{gist_id}/comments`、comment mutation endpoints 和 fork endpoints 会为了客户端兼容而存在，但只返回空数据或 no-op 响应。

暂不支持：

- Git transport，也就是不能对 gist repository 执行 `git clone`、`git push` 或 `git pull`。

## 相关项目

- [LiteGist](https://github.com/lockcp/LiteGist)

  > LiteGist 是一个极其轻量、专注体验的个人自建文本分享服务（Pastebin）。它采用了全屏编辑器的设计理念，支持 Markdown 渲染、代码高亮、多文件 Gist 管理、订阅转换及 PWA，旨在为您提供类似于“私有化 Gist”的极速分享体验。
