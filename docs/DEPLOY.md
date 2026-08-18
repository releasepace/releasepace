# ReleasePace – Deployment Guide (100% Free Tier)

## Stack
| Layer       | Service               | Free tier                          |
|-------------|----------------------|------------------------------------|
| Database    | Supabase             | 500 MB, unlimited API calls        |
| API server  | Cloudflare Workers   | 100,000 req/day, 0 cold starts     |
| Dashboard   | Cloudflare Pages     | Unlimited requests, global CDN     |
| SDKs        | npm / PyPI / Maven / pkg.go.dev | Free forever          |

---

## Step 1 — Supabase setup (15 min)

1. Create account at https://supabase.com
2. New project → note your **Project URL** and **service_role key**
3. Go to SQL Editor → paste contents of `supabase/migrations/001_initial_schema.sql` → Run
4. Settings → API → copy:
   - `SUPABASE_URL`  (e.g. https://xxxx.supabase.co)
   - `SUPABASE_SERVICE_KEY`  (service_role, starts with eyJ)
   - `SUPABASE_JWT_SECRET`  (under JWT Settings)

---

## Step 2 — Deploy the API Worker (10 min)

```bash
cd api
npm install

# Set secrets (never commit these)
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put SUPABASE_JWT_SECRET

# Deploy to Cloudflare Workers
npm run deploy
# → https://releasepace-api.<your-subdomain>.workers.dev
```

Update `wrangler.toml` ALLOWED_ORIGINS to your dashboard URL.

---

## Step 3 — Deploy the Dashboard (10 min)

```bash
cd dashboard
npm install
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name releasepace-dashboard
# → https://releasepace-dashboard.pages.dev

# Set env var in Cloudflare Pages dashboard:
# VITE_API_URL = https://releasepace-api.<subdomain>.workers.dev
```

Or connect GitHub repo → Pages auto-deploys on every push.

---

## Step 4 — Create your first organisation

```bash
curl -X POST https://releasepace-api.<subdomain>.workers.dev/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"secure123","org_name":"Acme Corp"}'
```

Response includes your org_id and user JWT.

---

## Step 5 — Generate an SDK key

```bash
# Login to get JWT
TOKEN=$(curl -s -X POST .../api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"secure123"}' | jq -r .access_token)

# Create a client SDK key for production
curl -X POST .../api/admin/keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Production SDK key","type":"client","environment_id":"<prod-env-id>"}'

# → raw_key: rp_live_abc123... (shown once, store it)
```

---

## SDK Integration

### JavaScript / TypeScript
```bash
npm install releasepace-js
```
```ts
import { ReleasePace } from 'releasepace-js';
const fk = new ReleasePace({ apiKey: 'rp_live_xxx', environment: 'production' });
await fk.connect();
if (fk.isEnabled('new-feature')) { ... }
```

### React
```tsx
import { ReleasePaceProvider, useFlag } from 'releasepace-js/react';

function App() {
  return (
    <ReleasePaceProvider apiKey="rp_live_xxx" environment="production">
      <MyApp />
    </ReleasePaceProvider>
  );
}

function MyComponent() {
  const enabled = useFlag('new-checkout');
  const label   = useFlag('cta-label', 'Get Started');
  return enabled ? <NewCheckout label={label} /> : <OldCheckout />;
}
```

### Python
```bash
pip install releasepace
```
```python
from releasepace import ReleasePace

with ReleasePace(api_key='rp_live_xxx', environment='production') as fk:
    if fk.is_enabled('new-feature'):
        ...
    price = fk.get_number('base-price', default=29.99)
```

### Java
```xml
<dependency>
  <groupId>io.releasepace</groupId>
  <artifactId>releasepace-java</artifactId>
  <version>1.0.0</version>
</dependency>
```
```java
try (ReleasePace fk = ReleasePace.builder()
        .apiKey("rp_live_xxx")
        .environment("production")
        .build()
        .connect()) {

    if (fk.isEnabled("new-feature")) { ... }
    String text = fk.getString("banner-text", "Default");
}
```

### Go
```bash
go get github.com/releasepace/releasepace-go
```
```go
client, _ := releasepace.New(releasepace.Options{
    APIKey:      "rp_live_xxx",
    Environment: "production",
})
defer client.Close()

if client.IsEnabled("new-feature") { ... }
```

### Any language (plain HTTP)
```bash
curl https://releasepace-api.<subdomain>.workers.dev/api/client/features \
  -H "Authorization: Bearer rp_live_xxx" \
  -G -d "environment=production"
```

---

## Cloudflare free tier limits

| Resource          | Free limit         | ReleasePace usage           |
|-------------------|--------------------|-------------------------|
| Worker requests   | 100,000/day        | ~1 req per SDK per 30s  |
| Worker CPU        | 10ms/request       | ~1-3ms per request      |
| KV reads          | 100,000/day        | Not used                |
| Pages deployments | Unlimited          | Dashboard               |

At 100k req/day you support ~34 SDK instances polling every 30s, 24/7.
Upgrade to $5/month Workers Paid for 10M req/month.

---

## Custom domain

1. Cloudflare dashboard → Workers → releasepace-api → Triggers → Add Custom Domain
2. `api.yourdomain.com` → worker
3. `app.yourdomain.com` → Pages project
4. Update ALLOWED_ORIGINS in wrangler.toml and redeploy
