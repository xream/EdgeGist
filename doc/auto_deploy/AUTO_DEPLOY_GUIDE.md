# EdgeGist 自动化同步与安全部署指南 (GitHub Actions 篇)

## 第一步：准备工作 (Cloudflare 端)

在开始 GitHub 配置前，请先在 Cloudflare 完成以下三件事：

### 1. 创建 D1 数据库

1.  登录 Cloudflare，进入 **Workers & Pages > D1**。
2.  点击 **Create database** -> **Dashboard**。
3.  名字建议起为 `edge-gist`（或者您喜欢的名字）。
4.  创建成功后，页面上会显示一个 **Database ID** (一串类似 `xxxx-xxxx...` 的字符)，**请记下它**。

### 2. 创建 API 令牌 (Token)

1.  进入 [My API Tokens](https://dash.cloudflare.com/profile/api-tokens)。
2.  点击 **Create Token** -> 使用 **Edit Cloudflare Workers** 模板。
3.  在权限 (Permissions) 列表中，**必须包含以下 5 项**：
    - `Account` - `Workers Scripts` - `Edit`
    - `Account` - `Cloudflare Pages` - `Edit`
    - `Account` - `D1` - `Edit`
    - `Account` - `D1` - `Read`
    - `Account` - `Account Analytics` - `Read`
4.  保存并**记下生成的 Token 字符串**。

### 3. 清理旧脚本 (如果您是 Fork 用户)

- 删除项目中的 `.github/workflows/release.yml` 文件，避免干扰。

---

## 第二步：配置 GitHub Secrets

在您的 GitHub 仓库：**Settings > Secrets and variables > Actions > New repository secret**。

| 密钥名称               | 说明                                               |
| :--------------------- | :------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN` | 上一步创建的 API 令牌                              |
| `OWNER_USERNAME`       | EdgeGist 登录用户名                                |
| `OWNER_PASSWORD`       | EdgeGist 登录密码                                  |
| `OWNER_TOKEN`          | 管理 API Token                                     |
| `BASE_URL`             | 部署地址 (如 `https://gist.your-name.workers.dev`) |
| `D1_DATABASE_ID`       | 上一步记下的 D1 Database ID                        |

---

## 第三步：添加自动化脚本

### 1. 自动同步脚本

`.github/workflows/sync.yml`

```yaml
name: Sync Upstream
on:
  schedule:
    - cron: "0 0 * * *"
  workflow_dispatch:
jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Sync upstream
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git remote add upstream https://github.com/xream/EdgeGist.git
          git fetch upstream
          git checkout main
          git pull origin main --rebase

          # 尝试正常合并
          if ! git merge upstream/main --no-edit; then
            echo "发现冲突，开始自动保留本地配置..."
            # 如果冲突，强制保留我们自己的 .github 文件夹
            git checkout HEAD -- .github/ || true
            git add .github/ || true
            # 强制删除原作者的 release 脚本
            git rm -rf .github/workflows/release.yml || true
            # 提交合并
            git commit --no-edit
          fi

          git push origin main
```

### 2. 自动部署脚本

`.github/workflows/deploy.yml`

```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_run:
    workflows: ["Sync Upstream"]
    types: [completed]
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-latest
    if: ${{ github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success' }}
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - name: Install dependencies
        run: bun install
      - name: Generate wrangler.jsonc from Secrets
        run: |
          cp wrangler.example.jsonc wrangler.jsonc
          sed -i 's/"name": "edge-gist"/"name": "gist"/g' wrangler.jsonc
          sed -i "s/\"owner\"/\"${{ secrets.OWNER_USERNAME }}\"/g" wrangler.jsonc
          sed -i "s/\"change-this-password\"/\"${{ secrets.OWNER_PASSWORD }}\"/g" wrangler.jsonc
          sed -i "s/\"change-this-token\"/\"${{ secrets.OWNER_TOKEN }}\"/g" wrangler.jsonc
          sed -i "s|https://edge-gist.your-subdomain.workers.dev|${{ secrets.BASE_URL }}|g" wrangler.jsonc
          sed -i "s/\"replace-with-cloudflare-d1-database-id\"/\"${{ secrets.D1_DATABASE_ID }}\"/g" wrangler.jsonc
      - name: Build
        run: bun run build
      - name: Apply D1 migrations
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        run: npx wrangler d1 migrations apply edge-gist --remote
      - name: Deploy to Cloudflare
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        run: npx wrangler deploy
```

---

## 第四步：完成部署与 D1 绑定确认

1.  推送代码后，在 GitHub **Actions** 页面确认部署成功。
2.  **检查绑定**：虽然脚本会尝试自动绑定，但建议进入 Cloudflare 控制台，在该 Worker 的 **Settings > Bindings** 中确认是否已有 D1 绑定：
    - Variable name: `DB`
    - D1 database: 选择您的 `edge-gist` 数据库。
3.  点击保存并重新部署。
4.  **地址访问**：访问 `https://[您的域名].workers.dev/[您的用户名]` 即可开始使用。

---

## 维护建议

- **手动即时同步 (推荐)**：
  - **方式 A (网页端)**：直接在您的 GitHub 仓库首页点击 **Sync fork** -> **Update branch**。这是最简单的方式。
  - **方式 B (Action 端)**：去 GitHub Actions 选 `Sync Upstream` -> `Run workflow` 手动运行脚本。
- **处理同步冲突**：如果自动同步任务报红，或者网页端提示 `Conflict` 无法同步，说明原作者有较大的代码变动导致无法自动合并。此时请在您的电脑本地执行以下命令强制对齐：
  ```bash
  git fetch upstream
  git reset --hard upstream/main
  # 重新添加您的 workflow 文件并推送
  git add .github/workflows/
  git commit -m "Fix sync conflict"
  git push origin main --force
  ```
