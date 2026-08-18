# ReleasePace

Production-grade feature flag platform. Self-hosted, free tier on Cloudflare + Supabase.

## Architecture

```
Organisations  →  Cloudflare Worker API  →  Supabase Postgres
                        ↑                        (RLS per org)
               SDK polling every 30s
               (JS, Python, Java, Go, any HTTP)
```

## Repository structure

```
releasepace/
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql   # Full schema + RLS policies
│
├── api/                             # Cloudflare Worker
│   ├── src/
│   │   ├── index.ts                 # Router entry point
│   │   ├── lib/
│   │   │   ├── auth.ts              # JWT + API key resolution
│   │   │   └── response.ts          # Response helpers
│   │   └── routes/
│   │       ├── client.ts            # GET /api/client/features (SDK endpoint)
│   │       ├── admin-flags.ts       # CRUD flags + state per environment
│   │       ├── admin-environments.ts
│   │       ├── admin-keys.ts        # API key generation
│   │       ├── admin-audit.ts       # Audit log
│   │       └── auth.ts              # Signup / login
│   ├── package.json
│   └── wrangler.toml
│
├── sdks/
│   ├── js/                          # releasepace-js (npm) — Browser + Node
│   │   └── src/
│   │       ├── index.ts             # Core client + rollout logic
│   │       └── react.tsx            # ReleasePaceProvider + useFlag hook
│   ├── python/                      # releasepace (PyPI) — zero required deps
│   │   └── releasepace/__init__.py
│   ├── java/                        # releasepace-java (Maven Central)
│   │   └── src/main/java/io/releasepace/
│   │       ├── ReleasePace.java
│   │       └── Flag.java
│   └── go/                          # releasepace-go (pkg.go.dev)
│       └── releasepace/releasepace.go
│
└── docs/
    └── DEPLOY.md                    # Step-by-step deployment guide
```

## Features

- Multi-tenant with Postgres Row-Level Security (org isolation at DB level)
- 3 environments per org (dev / staging / production) out of the box
- Flag types: boolean, string, number, JSON
- Gradual rollout (0–100%) with sticky bucketing by userId
- API key management (client / server / admin keys)
- Full audit log (who changed what, when, old vs new value)
- RBAC: owner / admin / editor / viewer roles
- All SDKs speak one REST endpoint — add any language in <100 lines

## Deploy

See `docs/DEPLOY.md` for full instructions. Takes ~35 minutes.


## Author

Built by **[Aryaa Tiwari](https://github.com/AryaaTiwari)**

[![GitHub](https://img.shields.io/badge/GitHub-AryaaTiwari-181717?logo=github)](https://github.com/AryaaTiwari)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-aryaa--tiwari-0A66C2?logo=linkedin)](https://www.linkedin.com/in/aryaa-tiwari/)

## License

MIT
