<div align="center">

<img src="https://avatars.githubusercontent.com/u/318031578?s=120&v=4" width="72" height="72" style="border-radius:16px" alt="ReleasePace logo" />

# ReleasePace

**Production-grade feature flags for engineering teams.**

Control every release. Zero infrastructure to manage. Free to start.

[![License: MIT](https://img.shields.io/badge/License-MIT-7B61FF.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Runs%20on-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![Supabase](https://img.shields.io/badge/Backed%20by-Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Built by Aryaa Tiwari](https://img.shields.io/badge/Built%20by-Aryaa%20Tiwari-7B61FF)](https://github.com/AryaaTiwari)

[**Dashboard**](https://app.releasepace.io) · [**Docs**](https://releasepace.io/docs) · [**Landing page**](https://releasepace.io)

</div>

---

## What is ReleasePace?

ReleasePace is an open source feature flag platform — a free, self-hostable alternative to LaunchDarkly and Unleash. It lets engineering teams toggle any feature in any app instantly, without a redeploy, using SDKs available for JavaScript, Python, Java, Go, and any language that can make an HTTP request.

---

## SDKs

Official SDKs are maintained in separate repositories. All SDKs poll the same single REST endpoint — you build the API once and every language just works.

| Language | Repository | Registry | Install |
|---|---|---|---|
| **JavaScript / TypeScript** | [releasepace/releasepace-js](https://github.com/releasepace/releasepace-js) | [npm](https://www.npmjs.com/package/releasepace-js) | `npm install releasepace-js` |
| **React** | [releasepace/releasepace-js](https://github.com/releasepace/releasepace-js) | [npm](https://www.npmjs.com/package/releasepace-js) | `npm install releasepace-js` |
| **Python** | [releasepace/releasepace-python](https://github.com/releasepace/releasepace-python) | [PyPI](https://pypi.org/project/releasepace/) | `pip install releasepace` |
| **Java** | [releasepace/releasepace-java](https://github.com/releasepace/releasepace-java) | [Maven Central](https://central.sonatype.com/artifact/io.releasepace/releasepace-java) | see below |
| **Go** | [releasepace/releasepace-go](https://github.com/releasepace/releasepace-go) | [pkg.go.dev](https://pkg.go.dev/github.com/releasepace/releasepace-go) | `go get github.com/releasepace/releasepace-go` |
| **Any language** | — | REST / HTTP | `curl` (see below) |

### Quick start — JavaScript
```bash
npm install releasepace-js
```
```ts
import { ReleasePace } from 'releasepace-js'

const rp = new ReleasePace({ apiKey: 'rp_live_xxx', environment: 'production' })
await rp.connect()

if (rp.isEnabled('new-checkout')) { ... }
const label = rp.getString('cta-label', 'Get started')
```

### Quick start — React
```tsx
import { ReleasePaceProvider, useFlag } from 'releasepace-js/react'

function App() {
  return (
    <ReleasePaceProvider apiKey="rp_live_xxx" environment="production">
      <MyApp />
    </ReleasePaceProvider>
  )
}

function Checkout() {
  const enabled = useFlag('new-checkout')
  const label   = useFlag('cta-label', 'Buy now')
  return enabled ? <NewFlow label={label} /> : <OldFlow />
}
```

### Quick start — Python
```bash
pip install releasepace
```
```python
from releasepace import ReleasePace

with ReleasePace(api_key='rp_live_xxx', environment='production') as rp:
    if rp.is_enabled('new-checkout'):
        render_new_checkout()
    label = rp.get_string('cta-label', default='Get started')
```

### Quick start — Java
```xml
<!-- Maven -->
<dependency>
  <groupId>io.releasepace</groupId>
  <artifactId>releasepace-java</artifactId>
  <version>1.0.0</version>
</dependency>
```
```java
try (ReleasePace rp = ReleasePace.builder()
        .apiKey("rp_live_xxx")
        .environment("production")
        .build().connect()) {

    if (rp.isEnabled("new-checkout")) { ... }
    String label = rp.getString("cta-label", "Get started");
}
```

### Quick start — Go
```bash
go get github.com/releasepace/releasepace-go
```
```go
client, _ := releasepace.New(releasepace.Options{
    APIKey:      "rp_live_xxx",
    Environment: "production",
})
defer client.Close()

if client.IsEnabled("new-checkout") { ... }
label := client.GetString("cta-label", "Get started")
```

### Quick start — Any language (REST)
```bash
curl https://api.releasepace.io/api/client/features \
  -H "Authorization: Bearer rp_live_xxx" \
  -G -d "environment=production"
```
```json
{
  "version": 1,
  "environment": "production",
  "features": [
    { "key": "new-checkout", "enabled": true,  "value": null },
    { "key": "cta-label",    "enabled": true,  "value": "Get started" },
    { "key": "rate-limit",   "enabled": true,  "value": 100 }
  ]
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Organisations                         │
│                                                             │
│   Admin Dashboard          SDK (any language)               │
│   app.releasepace.io       npm / PyPI / Maven / go get      │
└────────────┬───────────────────────┬────────────────────────┘
             │ JWT / Admin key       │ SDK key
             ▼                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Cloudflare Workers API (Edge)                   │
│              api.releasepace.io                             │
│                                                             │
│   POST /api/auth/signup      GET  /api/client/features      │
│   POST /api/auth/login       POST /api/admin/flags          │
│   PUT  /api/admin/flags/:id  GET  /api/admin/audit          │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Supabase (Postgres)                        │
│                                                             │
│   organisations   flags        flag_states                  │
│   org_members     environments audit_log                    │
│   api_keys                                                  │
│                                                             │
│   Row-Level Security — org isolation enforced at DB level   │
└─────────────────────────────────────────────────────────────┘
```

---

## This repository

This is the **core platform monorepo**. It does not contain the SDK source code — those live in their own repos above.

```
releasepace/
├── api/                        Cloudflare Worker — REST API
│   ├── src/
│   │   ├── index.ts            Router entry point
│   │   ├── lib/
│   │   │   ├── auth.ts         JWT + API key resolution + hashing
│   │   │   └── response.ts     Response helpers, pagination
│   │   └── routes/
│   │       ├── client.ts       GET /api/client/features (SDK endpoint)
│   │       ├── admin-flags.ts  CRUD flags + per-environment state
│   │       ├── admin-environments.ts
│   │       ├── admin-keys.ts   API key generation + revocation
│   │       ├── admin-audit.ts  Audit log
│   │       └── auth.ts         Signup / login
│   ├── package.json
│   └── wrangler.toml
│
├── dashboard/                  React admin app — Cloudflare Pages
│   └── src/
│       ├── pages/
│       │   ├── Auth.tsx        Login + signup
│       │   ├── Flags.tsx       Flag list with per-env toggles
│       │   ├── FlagDetail.tsx  Per-env state, rollout slider, audit
│       │   └── OtherPages.tsx  Environments, API Keys, Audit, Settings
│       ├── components/
│       │   ├── Sidebar.tsx     Navigation
│       │   └── ui.tsx          Shared components
│       ├── context/AuthContext.tsx
│       └── lib/api.ts          Typed API client
│
├── landing/
│   └── index.html              Marketing site — zero build step
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql   Full schema + RLS policies
│
├── .github/workflows/
│   ├── ci.yml                  Typecheck + test on every PR
│   ├── deploy-api.yml          Deploy Worker on push to main
│   ├── deploy-dashboard.yml    Deploy dashboard on push to main
│   ├── deploy-landing.yml      Deploy landing page on push to main
│   ├── deploy-migrations.yml   Apply DB migrations on push to main
│   └── publish-sdks.yml        Publish SDKs on version tags
│
├── docs/
│   ├── DEPLOY.md               Step-by-step deployment guide
│   ├── SECRETS.md              GitHub secrets setup reference
│   └── SDK-PUBLISHING.md       How to publish each SDK to its registry
│
└── scripts/
    └── setup.sh                One-command local bootstrap
```

---

## Features

| Feature | Details |
|---|---|
| **Flag types** | Boolean, string, number, JSON |
| **Environments** | Dev / staging / production per org — same key, different value |
| **Gradual rollouts** | 0–100% with sticky MD5 bucketing by `userId` |
| **Multi-tenant** | Postgres RLS enforces org isolation at DB level |
| **RBAC** | Owner / Admin / Editor / Viewer roles |
| **API keys** | Client / server / admin keys, scoped per environment, SHA-256 hashed |
| **Audit log** | Every change: who, when, old value, new value |
| **Kill switch** | One toggle disables any flag instantly across all SDKs |
| **Edge delivery** | Cloudflare Workers — ~1ms flag reads globally |
| **Any language** | One REST endpoint — any HTTP client works as an SDK |

---

## Deploy in 35 minutes (free)

| Layer | Service | Free tier |
|---|---|---|
| Database | Supabase | 500 MB, unlimited API calls |
| API | Cloudflare Workers | 100,000 req/day, 0 cold starts |
| Dashboard | Cloudflare Pages | Unlimited, global CDN |
| Landing | Cloudflare Pages | Unlimited |

See **[docs/DEPLOY.md](docs/DEPLOY.md)** for the full step-by-step guide.

```bash
# Clone and bootstrap
git clone https://github.com/releasepace/releasepace.git
cd releasepace
bash scripts/setup.sh

# Start local dev
npm run dev   # starts API (port 8787) + dashboard (port 5173)
```

---

## Author

Built by **[Aryaa Tiwari](https://github.com/AryaaTiwari)**

[![GitHub](https://img.shields.io/badge/GitHub-AryaaTiwari-181717?logo=github&logoColor=white)](https://github.com/AryaaTiwari)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-aryaa--tiwari-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/aryaa-tiwari/)

---

## Contributing

Pull requests are welcome. For major changes please open an issue first.

1. Fork the repo
2. Create a branch: `git checkout -b feat/my-feature`
3. Run `bash scripts/setup.sh` to get started
4. Make your changes — CI runs typechecks and tests on every PR
5. Open a pull request against `main`

---

## License

MIT © 2026 [ReleasePace](https://github.com/releasepace)
