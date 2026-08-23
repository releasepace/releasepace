# ReleasePace — Deployment Guide

Deploy the ReleasePace platform (API + dashboard + landing page) on Cloudflare and Supabase, both on their free tiers.

**Realistic time:** ~30 minutes if you already have Cloudflare and Supabase accounts and `wrangler` configured. Plan for 60–90 minutes from a truly cold start.

Two paths — pick one:

- **[Path A — GitHub Actions (recommended)](#path-a--github-actions-recommended)** — set 5 secrets, push to `main`, watch it deploy.
- **[Path B — Manual deploy](#path-b--manual-deploy)** — run every step by hand. Useful for debugging or learning the pieces.

Both paths share **[Step 0 — Supabase setup](#step-0--supabase-setup-both-paths)** and the final **[Create your first org](#create-your-first-org)** section.

---

## Prerequisites

You need these before either path works.

| Requirement                         | Notes                                                          |
| ----------------------------------- | -------------------------------------------------------------- |
| Node **20+** and npm **10+**        | Check with `node -v && npm -v`                                 |
| A **Supabase** account              | <https://supabase.com> — free tier is plenty                   |
| A **Cloudflare** account            | <https://dash.cloudflare.com> — free tier                      |
| Cloudflare **Account ID**           | Dashboard sidebar (right side on any domain page)              |
| `wrangler` CLI (Path B only)        | `npm install -g wrangler && wrangler login`                    |
| `jq` (Path B only)                  | For extracting tokens from JSON responses                      |
| A custom domain (optional)          | Only if you want `api.yourdomain.com`, etc.                    |

---

## Stack overview

| Layer     | Service            | Free tier                      | Notes                        |
| --------- | ------------------ | ------------------------------ | ---------------------------- |
| Database  | Supabase           | 500 MB, unlimited API calls    | Postgres + Auth + RLS        |
| API       | Cloudflare Workers | 100,000 req/day, 0 cold starts | ~1–3 ms per request          |
| Dashboard | Cloudflare Pages   | Unlimited requests, global CDN | Static React build           |
| Landing   | Cloudflare Pages   | Unlimited                      | Static HTML                  |

---

## Step 0 — Supabase setup (both paths)

Both deploy paths need Supabase configured first.

1. Create an account at <https://supabase.com>.
2. **New project** → pick the region closest to your users → generate and save a strong DB password.
3. Wait ~2 minutes for the project to provision.
4. Go to **SQL Editor → New query**, paste the entire contents of `supabase/migrations/001_initial_schema.sql`, and click **Run**.
5. **Verify:** open **Table Editor**. You should see these tables: `organisations`, `org_members`, `environments`, `flags`, `flag_states`, `api_keys`, `audit_log`.
6. Go to **Settings → API** and copy these three values — you'll need them in the next step:

| Field                  | Where to find it                                          |
| ---------------------- | --------------------------------------------------------- |
| `SUPABASE_URL`         | Project URL, e.g. `https://abcdefg.supabase.co`           |
| `SUPABASE_SERVICE_KEY` | `service_role` secret (starts with `eyJ`) — **not** anon  |
| `SUPABASE_JWT_SECRET`  | Under **JWT Settings** on the same page                   |

> ⚠️ **Supabase key model:** Supabase is rolling out a new **publishable / secret key** model that replaces `service_role` + JWT secret. If your project UI shows those instead of the fields above, use the new keys and update `api/wrangler.toml` accordingly. This guide will be updated once the migration is universal.

---

## Path A — GitHub Actions (recommended)

Everything deploys automatically on every push to `main`.

### A1. Fork the repo

<https://github.com/releasepace/releasepace> → **Fork** to your account.

### A2. Get a Cloudflare API token

In the Cloudflare dashboard: **My Profile → API Tokens → Create Token** → use the **"Edit Cloudflare Workers"** template → keep the default scopes → **Continue → Create Token** → copy the token immediately (it's only shown once).

### A3. Add secrets to your fork

Repo → **Settings → Secrets and variables → Actions → New repository secret** — add each of these:

| Secret                  | Value                                                        |
| ----------------------- | ------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | From step A2                                                 |
| `CLOUDFLARE_ACCOUNT_ID` | From Cloudflare dashboard sidebar                            |
| `SUPABASE_URL`          | From Step 0                                                  |
| `SUPABASE_SERVICE_KEY`  | From Step 0                                                  |
| `SUPABASE_JWT_SECRET`   | From Step 0                                                  |
| `VITE_API_URL`          | `https://releasepace-api.<your-subdomain>.workers.dev` (see below) |

> **The `VITE_API_URL` chicken-and-egg:** you don't know the Worker URL until after the first API deploy. Two options:
> - **Easy path:** skip this secret for the first push. After `deploy-api.yml` succeeds, grab the URL from its log output, set the secret, then push a trivial commit to trigger a dashboard rebuild.
> - **If you use a custom domain:** you already know the URL — set it up front.

> ⚠️ **Verify secret names against the workflows.** This guide assumes conventional names but the source of truth is your `.github/workflows/*.yml` files. If a workflow expects `CF_API_TOKEN` instead of `CLOUDFLARE_API_TOKEN`, use whatever the workflow references.

### A4. Push a commit to `main`

The workflows in `.github/workflows/` will fire:

- `deploy-migrations.yml` — applies Supabase migrations
- `deploy-api.yml` — deploys the Worker
- `deploy-dashboard.yml` — builds and publishes the dashboard
- `deploy-landing.yml` — publishes the landing page

Watch progress in the **Actions** tab. All four should turn green in 2–3 minutes.

### A5. Verify

Open the URLs from the workflow logs:

- **Worker:** `curl https://releasepace-api.<subdomain>.workers.dev/health` should return `200 OK`
- **Dashboard:** should render the login page
- **Landing:** should render

Skip ahead to **[Create your first org](#create-your-first-org)**.

---

## Path B — Manual deploy

Do this if you want to run every step yourself, or when Path A workflows fail and you need to isolate the problem.

### B1. Install and log in to `wrangler`

```bash
npm install -g wrangler
wrangler login    # opens a browser tab to authorize
wrangler whoami   # confirm you're logged in
```

### B2. Deploy the API Worker

```bash
cd api
npm install

wrangler secret put SUPABASE_URL           # paste value when prompted
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put SUPABASE_JWT_SECRET

npm run deploy
# → prints: https://releasepace-api.<your-subdomain>.workers.dev
```

**Verify:** `curl https://releasepace-api.<subdomain>.workers.dev/health` returns `200 OK`.

### B3. Deploy the dashboard

Vite bakes environment variables in at build time, so **set the API URL before running the build**:

```bash
cd ../dashboard
npm install

# Point the dashboard at the Worker URL from B2
echo "VITE_API_URL=https://releasepace-api.<subdomain>.workers.dev" > .env.production
npm run build

npx wrangler pages deploy dist --project-name releasepace-dashboard
# → prints: https://releasepace-dashboard.pages.dev
```

**Verify:** open the printed URL — you should see the login screen.

### B4. Lock down CORS

Now that the dashboard URL exists, restrict the API to accept requests from it:

1. Edit `api/wrangler.toml` and set `ALLOWED_ORIGINS = "https://releasepace-dashboard.pages.dev"` (comma-separate multiple origins).
2. Redeploy: `cd api && npm run deploy`

### B5. Deploy the landing page

```bash
cd ../landing
npx wrangler pages deploy . --project-name releasepace-landing
```

---

## Create your first org

Both paths converge here.

```bash
API=https://releasepace-api.<subdomain>.workers.dev

curl -X POST $API/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"strong-password-here","org_name":"Acme Corp"}'
```

The response contains your `org_id`, an `access_token` (JWT), and the default environments (`development`, `staging`, `production`) with their IDs. Save these — you'll need the production environment ID next.

## Generate an SDK key

Do this in the dashboard (**API Keys → New Key**) or via the API:

```bash
# Log in to get a fresh JWT
TOKEN=$(curl -s -X POST $API/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"strong-password-here"}' | jq -r .access_token)

# If you didn't save the env IDs from signup, list them now
curl -s $API/api/admin/environments -H "Authorization: Bearer $TOKEN" | jq

# Create a client key scoped to production
curl -X POST $API/api/admin/keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Production SDK key","type":"client","environment_id":"<prod-env-id>"}'
# → raw_key: rp_live_abc123... (shown ONCE — copy it now)
```

---

## You're done — verify end to end

Do this loop once to prove everything is wired up:

1. **Log in** at your dashboard URL.
2. **Create a flag:** Flags → New Flag → key `test-flag`, type boolean, enabled in `production`.
3. **Read it from an SDK or plain HTTP:**
   ```bash
   curl $API/api/client/features \
     -H "Authorization: Bearer rp_live_abc123..." \
     -G -d "environment=production"
   ```
   You should see `test-flag: true` in the response.
4. **Toggle the flag off** in the dashboard.
5. **Curl again** — value should now be `false`.

That round trip is what "release with confidence" looks like. To keep going, install a real SDK: see the [SDK quick starts](../README.md#quick-start--javascript) in the main README.

---

## Troubleshooting

**`wrangler: command not found`**
Install it globally and log in: `npm install -g wrangler && wrangler login`.

**`Authentication error [code: 10000]` on `wrangler deploy`**
Run `wrangler login` and re-authorize. If you're using an API token, make sure it has the **Edit Cloudflare Workers** scope with `Account.Workers Scripts`, `Account.Workers KV Storage`, and `Zone.Workers Routes` permissions.

**Dashboard loads but shows "Failed to fetch" or CORS errors in the browser console**
`ALLOWED_ORIGINS` in `api/wrangler.toml` doesn't include your dashboard URL. Update it, redeploy the Worker, hard-reload the dashboard.

**Dashboard loads but every API call goes to `http://undefined/...`**
`VITE_API_URL` was empty at build time. Set it in `.env.production` (Path B) or in GitHub Actions secrets (Path A), then rebuild and redeploy Pages. Vite env vars are baked in at build time, not runtime.

**Supabase migration fails with `relation "organisations" already exists`**
You already ran the migration. Either skip it, or (only if you're OK losing all data) drop and recreate the schema in Supabase SQL Editor:
```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
```
Then re-run the migration.

**Signup returns 500**
`SUPABASE_JWT_SECRET` is almost certainly wrong or from the wrong project. Re-copy it from Supabase → **Settings → API → JWT Settings** and update the Worker secret.

**SDK returns an empty features list**
Wrong API key type (client vs server vs admin) or the key is scoped to a different environment. Check both when generating the key.

**GitHub Actions workflow fails with `Missing secret: X`**
The secret name in the workflow file doesn't match what you set. Open `.github/workflows/deploy-*.yml`, find the `${{ secrets.X }}` reference, and add a secret with exactly that name.

---

## Custom domain (optional)

1. Cloudflare dashboard → **Workers & Pages → `releasepace-api` → Settings → Triggers → Add Custom Domain** → `api.yourdomain.com`.
2. Same flow for `releasepace-dashboard` → `app.yourdomain.com`, and `releasepace-landing` → `yourdomain.com`.
3. Update `ALLOWED_ORIGINS` in `api/wrangler.toml`, and update `VITE_API_URL` (Path A: as a GitHub secret; Path B: in `dashboard/.env.production`).
4. Redeploy the API and the dashboard.

---

## Free-tier headroom

| Resource        | Free limit    | Typical usage                       |
| --------------- | ------------- | ----------------------------------- |
| Worker requests | 100,000/day   | ~1 req per SDK instance per 30s     |
| Worker CPU      | 10 ms/request | 1–3 ms per request                  |
| Supabase DB     | 500 MB        | Thousands of flags + years of audit |
| Pages requests  | Unlimited     | —                                   |

At 100k requests/day you comfortably support ~35 SDK instances polling every 30 seconds, 24/7. When you outgrow this, Cloudflare Workers Paid is **$5/month** for 10M requests/month.

---

If a step above didn't work as written, please [open an issue](https://github.com/releasepace/releasepace/issues/new) with the failing command and the error — it helps the next person land on their feet.
