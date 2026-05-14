# EdgeGist Automated Sync & Secure Deployment Guide (GitHub Actions)

## Step 1: Prerequisites (Cloudflare Side)

Before configuring GitHub, please complete these three tasks in Cloudflare:

### 1. Create a D1 Database

1.  Log in to Cloudflare, go to **Workers & Pages > D1**.
2.  Click **Create database** -> **Dashboard**.
3.  Name it `edge-gist` (or any name you prefer).
4.  Once created, copy the **Database ID** (a string like `xxxx-xxxx...`). **Save it for later**.

### 2. Create an API Token

1.  Go to [My API Tokens](https://dash.cloudflare.com/profile/api-tokens).
2.  Click **Create Token** -> Use the **Edit Cloudflare Workers** template.
3.  In the permissions list, **ensure the following 5 are included**:
    - `Account` - `Workers Scripts` - `Edit`
    - `Account` - `Cloudflare Pages` - `Edit`
    - `Account` - `D1` - `Edit`
    - `Account` - `D1` - `Read`
    - `Account` - `Account Analytics` - `Read`
4.  Save and **copy the generated Token string**.

### 3. Cleanup Old Scripts (For Fork Users)

- Delete the `.github/workflows/release.yml` file from your project to avoid conflicts.

---

## Step 2: Configure GitHub Secrets

In your GitHub repository: **Settings > Secrets and variables > Actions > New repository secret**.

| Secret Name            | Description                                                 |
| :--------------------- | :---------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN` | The API Token created in the previous step                  |
| `OWNER_USERNAME`       | EdgeGist login username                                     |
| `OWNER_PASSWORD`       | EdgeGist login password                                     |
| `OWNER_TOKEN`          | Admin API Token                                             |
| `BASE_URL`             | Deployment URL (e.g., `https://gist.your-name.workers.dev`) |
| `D1_DATABASE_ID`       | The D1 Database ID saved earlier                            |

---

## Step 3: Add Automation Workflows

### 1. Auto-Sync Workflow

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

          # Attempt normal merge
          if ! git merge upstream/main --no-edit; then
            echo "Conflicts detected, auto-resolving to keep local configurations..."
            # Keep our own .github directory
            git checkout HEAD -- .github/ || true
            git add .github/ || true
            # Remove upstream's release script if it conflicts
            git rm -rf .github/workflows/release.yml || true
            # Commit the merge
            git commit --no-edit
          fi

          git push origin main
```

### 2. Auto-Deploy Workflow

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

## Step 4: Finalize Deployment & D1 Binding

1.  After pushing the code, confirm the deployment was successful in the GitHub **Actions** tab.
2.  **Verify Binding**: Although the script attempts to automate this, it's recommended to go to the Cloudflare dashboard, under **Settings > Bindings** for your Worker, and verify the D1 binding:
    - Variable name: `DB`
    - D1 database: Select your `edge-gist` database.
3.  Save and redeploy if necessary.
4.  **Access URL**: Visit `https://[your-domain].workers.dev/[your-username]` to start using EdgeGist.

---

## Maintenance Tips

- **Instant Manual Sync (Recommended)**:
  - **Method A (GitHub UI)**: Click **Sync fork** -> **Update branch** on your repo homepage.
  - **Method B (Actions)**: Go to Actions -> `Sync Upstream` -> `Run workflow`.
- **Handling Sync Conflicts**: If the sync fails or GitHub shows a `Conflict`, it means upstream changes cannot be automatically merged with yours. Run the following locally to force align:
  ```bash
  git fetch upstream
  git reset --hard upstream/main
  # Restore your workflow files and push
  git add .github/workflows/
  git commit -m "Fix sync conflict"
  git push origin main --force
  ```
