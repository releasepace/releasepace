# GitHub Secrets Setup

All secrets are set under:
**GitHub repo → Settings → Secrets and variables → Actions → New repository secret**

---

## Required secrets (all workflows)

| Secret | Where to get it | Used by |
|--------|----------------|---------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template | All deploy workflows |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → right sidebar | All deploy workflows |
| `SUPABASE_ACCESS_TOKEN` | Supabase dashboard → Account → Access Tokens | Migration workflow |
| `SUPABASE_STAGING_PROJECT_REF` | Supabase project URL: `https://[ref].supabase.co` | Migration workflow |
| `PROD_API_URL` | Your deployed Worker URL e.g. `https://api.releasepace.io` | Dashboard deploy |
| `PREVIEW_API_URL` | Preview Worker URL e.g. `https://releasepace-api-preview.workers.dev` | Dashboard deploy |

## Optional secrets

| Secret | Where to get it | Used by |
|--------|----------------|---------|
| `SLACK_WEBHOOK_URL` | Slack → Apps → Incoming Webhooks | Deploy notifications |
| `NPM_TOKEN` | npmjs.com → Access Tokens → Granular (publish) | SDK publish |
| `PYPI_TOKEN` | pypi.org → Account settings → API tokens | SDK publish |
| `MAVEN_USERNAME` | Sonatype Central → Account | SDK publish |
| `MAVEN_PASSWORD` | Sonatype Central → Account | SDK publish |
| `GPG_PRIVATE_KEY` | `gpg --export-secret-keys --armor <key-id>` | SDK publish |
| `GPG_PASSPHRASE` | Your GPG key passphrase | SDK publish |

---

## GitHub Environments

Create a `production` environment to add manual approval gates:

1. Repo → Settings → Environments → New environment → `production`
2. Add "Required reviewers" — yourself or your team lead
3. The `deploy-api.yml` production job will pause for approval before deploying

---

## Cloudflare API Token permissions

When creating the token, select these permissions:
- Account → Cloudflare Pages → Edit
- Account → Workers Scripts → Edit
- Zone → Zone → Read (if using custom domains)

---

## How to trigger SDK publishes

```bash
# Publish JS SDK v1.0.1
git tag sdk/js/v1.0.1
git push origin sdk/js/v1.0.1

# Publish Python SDK v1.0.1
git tag sdk/python/v1.0.1
git push origin sdk/python/v1.0.1

# Publish Java SDK v1.0.1
git tag sdk/java/v1.0.1
git push origin sdk/java/v1.0.1

# Publish Go SDK (pkg.go.dev auto-indexes from GitHub tags)
git tag sdks/go/v1.0.1
git push origin sdks/go/v1.0.1
```
