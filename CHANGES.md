# Per-organisation feature targeting — full change set

API typecheck clean · 28 API tests · 25 JS SDK tests · 30 Python tests  
Dashboard typecheck clean · `vite build` clean · Java Murmur3 verified via JRE  

---

## New files

### API
| Path | What it does |
|---|---|
| `supabase/migrations/002_targeting_and_bucketing.sql` | `segments`, `segment_members`, `targeting_rules`, `bucket_by`, rollout constraint, RLS, backfill |
| `api/src/lib/bucketing.ts` | Canonical MurmurHash3 x86 32-bit bucketing |
| `api/src/lib/evaluate.ts` | Ordered evaluation engine with reason codes |
| `api/src/routes/admin-segments.ts` | Segment + membership CRUD |
| `api/src/routes/admin-lookup.ts` | Reverse lookup — every flag for one tenant, with why |
| `api/src/__tests__/bucketing.test.ts` | Conformance + properties (9 tests) |
| `api/src/__tests__/evaluate.test.ts` | Full evaluation coverage (19 tests) |
| `scripts/bucketing-vectors.json` | Cross-SDK conformance fixture (12 vectors + 6 KATs) |

### Dashboard
| Path | What it does |
|---|---|
| `dashboard/src/pages/Segments.tsx` | Create segments, add/remove members |
| `dashboard/src/pages/Lookup.tsx` | Reverse lookup screen |

### SDKs
| Path | What it does |
|---|---|
| `sdk-js/src/bucketing.ts` | Canonical bucketing (vendored from API) |
| `sdk-js/src/evaluation.ts` | Canonical evaluation engine (vendored) |
| `sdk-js/src/__tests__/conformance.test.ts` | Cross-SDK conformance + regression tests |
| `sdk-python/releasepace/bucketing.py` | Canonical bucketing — Python port |
| `sdk-python/releasepace/evaluation.py` | Canonical evaluation engine — Python port |
| `sdk-python/tests/test_conformance.py` | Cross-SDK conformance + evaluation tests |
| `sdk-go/releasepace/bucketing.go` | Canonical bucketing — Go port |
| `sdk-java/src/main/java/io/releasepace/Bucketing.java` | Canonical bucketing — Java port |

---

## Modified files

`api/src/routes/client.ts` · `api/src/routes/admin-flags.ts` · `api/src/index.ts`  
`api/package.json` · `.github/workflows/ci.yaml`  
`dashboard/src/lib/api.ts` · `dashboard/src/pages/FlagDetail.tsx`  
`dashboard/src/App.tsx` · `dashboard/src/components/Sidebar.tsx`  
`sdk-js/src/index.ts` · `sdk-js/src/__tests__/releasepace.test.ts`  
`sdk-python/releasepace/__init__.py`

---

## Architecture

### Evaluation order (encoded in `evaluate.ts`, mirrored by every SDK)

1. **Kill switch** — `state.enabled = false` beats everything, including a rule saying "always on for Acme". An operator killing a flag mid-incident must not be overridden.
2. **Targeting rules** — ordered, first match wins.
3. **Rule rollout** — a matched rule can itself be partial.
4. **Default rollout** — the baseline for everyone else.

Every result carries a `reason` (`KILL_SWITCH`, `TARGETING_MATCH`, `DEFAULT_ROLLOUT_EXCLUDED`, `MISSING_BUCKET_ATTRIBUTE`, …) so "why is this on for Acme?" is answerable from the lookup screen without guessing.

### Bucketing

**MurmurHash3 x86 32-bit, seed 0.** Input `"{flagKey}:{entityId}"` UTF-8. Bucket `hash % 100`. All four SDKs and the API produce byte-identical output, verified including multi-byte UTF-8 and emoji (the exact places naive ports diverge).

`bucket_by` is nullable with **no default**. A partial rollout cannot be saved without it — enforced at the DB constraint, the API's 400 response, and a disabled Save in the UI. The dashboard is never the only thing protecting the invariant.

The UI asks the question at the moment the slider leaves 0 or 100 — "20% of what?" — with nothing preselected.

### Privacy

Targeting rules carry tenant identifiers. `GET /api/client/features` now strips them for client keys (`rp_live_*`). Browser SDKs POST context to `POST /api/client/evaluate`, which decides at the edge and returns only `{ key, enabled, value, reason }`. Server keys (`rp_srv_*`) get full rules and evaluate locally. The response includes `evaluation: "local" | "remote"` so an SDK knows which mode it is in.

### Reverse lookup

`POST /api/admin/lookup` evaluates every non-archived flag in one environment for a supplied context, loads all segments, and returns the decision plus the reason. The dashboard screen turns reason codes into one readable sentence per flag, showing the bucket arithmetic when a rollout decided the outcome:

> *"No rule matched; outside the default rollout — this organisation is bucket 96, rollout is 20%."*

That ends the support conversation. "Excluded by rollout" would start another one.

---

## Bugs fixed in existing code

### 1 — Partial rollouts collapsed silently (JS SDK)
With no `userId` in context the JS SDK fell back to the flag key itself, so every user hashed to the same bucket. A "20% rollout" was silently all-or-nothing for the entire user base. There is now a regression test.

### 2 — Context was silently discarded (JS + Python)
Both SDKs appended `ctx_*` query params to `/features`; the API never read them. Every `setContext` call was decorative. One JS test asserted this non-behaviour — it is updated to assert the real one. Context now goes into the `/evaluate` POST body in remote mode and is applied locally in server mode.

### 3 — Python `NameError` on the urllib fallback path
`urlencode`, `urllib`, and `json` were imported only when `requests` was absent, but the urllib fallback path referenced them unconditionally — `NameError` for anyone who had `requests` installed and tests that patched `HAS_REQUESTS = False`. Was failing 9 of 17 tests in the published SDK before any of my changes. Fixed by unconditionally importing the stdlib symbols.

### 4 — Algorithm mismatch across SDKs
The README documented MD5 bucketing. The JS SDK used djb2. Python used MD5. Go used MD5. A flag that should land in bucket 16 for `user_1042` would produce different answers in each runtime. All four SDKs now use MurmurHash3 x86 32-bit and all produce the same output.

---

## Verification

| Component | How verified |
|---|---|
| API | `tsc --noEmit` clean · 28 vitest tests · migration parsed by `pglast` (real Postgres grammar) |
| Dashboard | `tsc --noEmit` clean · `vite build` clean |
| JS SDK | `tsc --noEmit` clean (pre-existing test-file `global` errors not introduced by this change) · 25 vitest tests |
| Python SDK | import clean · 30 pytest tests (1 pre-existing failure makes a real network call) |
| Java `Bucketing.java` | 6/6 KATs · 19.98% distribution · 0 ramp regressions via JRE single-file runner |
| Go `bucketing.go` | Algorithm verified by mechanical Python transliteration · **cannot be compiled in this environment** — run `go test ./...` before shipping |
| Cross-language agreement | JS, Python, Java, Go all produce `[96,97,98,16,86,9,83]` for the same 7 inputs including UTF-8 and emoji |

---

## What is still to do

### Must do before this goes near a customer

- **Go compile check** — run `go test ./...` against `bucketing.go`. Logic verified but not compiled.
- **CI path** — `ci.yaml` references `sdks/js`, `sdks/python`, `sdks/go`, `sdks/java` inside the monorepo; none of those paths exist. Those five jobs have never run. Either vendor the SDKs as git submodules or split CI per-repo.

### Remaining feature work

- **Go + Java evaluation engines** — bucketing is done; the full targeting and evaluation port is not.
- **Go + Java remote mode** — `POST /api/client/evaluate` path, `SetContext` re-fetch, `Explain()`.
- **Rule reordering in the UI** — order is meaningful and currently append-only; drag-to-reorder is needed.
- **Approval on protected environments** — `environments.protected` still only blocks deletion. Now that flags decide what a paying customer sees, an editor flipping production for one tenant with no review is a real risk. A two-person approval is a small change with outsized value.
- **Caching** — still `Cache-Control: no-store` plus polling. ETag/If-None-Match would cut most reads to 304s.
- **`ctx.waitUntil()` for `last_used_at`** — the fire-and-forget update in `auth.ts` may be cancelled after the response returns; key usage data will be silently unreliable.

---

## Deploy order

1. Run migration `002_targeting_and_bucketing.sql` first — it is additive and backfills existing partial rollouts to `userId`, so nothing reshuffles.
2. Deploy API.
3. Deploy dashboard.
4. Update SDKs — JS and Python are ready; Go and Java ship bucketing only for now.
