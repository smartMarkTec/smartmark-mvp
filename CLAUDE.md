# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Extended architecture docs

Read these before making non-trivial edits:
- `docs/BACKEND_ARCHITECTURE_NOTES.md` — deep backend map, fragility list, editing priorities
- `docs/FRONTEND_ARCHITECTURE_NOTES.md` — frontend flow, storage strategy, high-risk pages
- `__tests__/CLAUDE.md` — core editing rules

## Commands

**Frontend (CRA, runs on port 3000):**
```bash
npm start          # dev server (proxies /api/* and /auth/* to localhost:5176)
npm run build      # production build — run this to verify no compile errors
npm test           # Jest/RTL tests
```

**Backend (Express, runs on port 5176 locally, 10000 on Render):**
```bash
cd server && npm run dev    # nodemon dev server
cd server && npm start      # production start
node --check server/server.js          # syntax check
node --check server/routes/<file>.js   # syntax check a route
```

**The `proxy` field in root `package.json` points to `http://localhost:5176`** — that is the backend port for local development.

## Deployment architecture

- **Frontend**: Vercel (`smartemark.com`). `vercel.json` rewrites `/api/*`, `/auth/*`, `/generated/*`, `/smart/*` to `https://smartmark-mvp.onrender.com`.
- **Backend**: Render (`smartmark-mvp.onrender.com`). Single Express server serving all API routes.
- **Frontend code must use same-origin paths** (`/api/...`, `/auth/...`) so Vercel proxies them — never hardcode Render URLs in UI fetch calls. The one exception is `RENDER_MEDIA_ORIGIN` in `CampaignSetup.js`, which is used only for Meta image URLs (Meta fetches images directly from Render).

## Data layer

All server state lives in a single LowDB JSON file (`server/db.js`). Key collections:

| Collection | Purpose |
|---|---|
| `users` | Account records with billing fields |
| `sessions` | `sm_sid` → username bindings |
| `tokens.byOwner` | FB user tokens keyed by ownerKey |
| `tokens.metaByOwner` | Token expiry meta keyed by ownerKey |
| `optimizer_campaign_state` | Per-campaign optimizer state (the core AI loop memory) |
| `campaign_contexts` | Intake/objective data per campaign session |
| `creative_history` | Record of generated creatives |
| `call_tracking_events` | Twilio inbound call log |
| `call_recordings` | Twilio recording metadata (orphans when no matching call event) |
| `landing_leads` | Schedule Service form submissions |

On Render, `DATA_DIR` defaults to `/var/data/smartmark` (persistent disk) or `/tmp` (ephemeral). Locally it uses `server/data/`.

## Identity: ownerKey and sm_sid

The most important backend concept. Every user-owned resource (FB token, optimizer state, etc.) is keyed by an `ownerKey`:
- Format `user:<username>` when a session is linked to a logged-in user
- Falls back to the raw session SID string when not linked

Session SID (`sm_sid`) is set as a cookie **and** stored in `localStorage` under key `sm_sid_v1`. The frontend injects it as the `x-sm-sid` header on every auth fetch as a cookie fallback. Backend reads it from cookie → header → query param in that priority order.

**Do not change ownerKey generation logic or SID persistence** — token and campaign ownership depends on it surviving OAuth redirects, Stripe redirects, and page refreshes.

## Facebook token storage

`server/tokenStore.js` owns all FB token reads/writes. It wraps LowDB with an in-memory cache. Always use its exported functions (`getFbUserToken`, `setFbUserToken`, etc.) — never read `db.data.tokens` directly. Tokens are per-ownerKey; the legacy single-token path (`db.data.tokens.fbUserToken`) still exists for backward compatibility.

## Optimizer pipeline

The autonomous campaign optimizer runs as a 7-stage loop, each stage in its own file:

```
optimizerMetricsSync → optimizerDiagnosis → optimizerDecision →
optimizerAction → optimizerMonitoring → optimizerPublicSummary
                                        ↑ orchestrated by optimizerOrchestrator.js
                                        ↑ scheduled by optimizerScheduler.js
                                        ↑ auto-run by optimizerAutoRunner.js
```

`optimizerCampaignState.js` is the shared state store for all stages — all modules read/write to it. **Do not rename fields in optimizer state** without tracing all consumers.

The autorunner starts inside `routes/auth.js` module load — **do not also start it in `server.js`** (causes duplicate intervals).

## High-risk files — edit surgically

| File | Why high-risk |
|---|---|
| `server/routes/auth.js` | Identity + FB connect + optimizer wiring + Meta API logging — 5 jobs in one file |
| `src/pages/CampaignSetup.js` | Auth/billing/FB/creative/launch continuity all converge here |
| `src/pages/FormPage.js` (if present) | Creative draft persistence, user namespace, active context |
| `server/smartCampaignEngine/index.js` | Meta Graph helpers and campaign execution policy |
| `server/optimizerAction.js` | Actually mutates live Meta campaigns |
| `server/server.js` | Middleware ordering matters; Stripe raw body must be captured before JSON parser |

## Plan/billing tiers

Current public plan names map to internal keys:

| Public name | Internal key | Campaigns | Ad accounts |
|---|---|---|---|
| Base | starter | 3 | 1 |
| Deluxe | pro | 6 | 2 |
| Premium | operator | 10 | 3 |

Legacy names `Standard`/`Starter`/`Pro`/`Operator` also map through `normalizeBillingPlanKey()` in `auth.js`. Both old and new Stripe price IDs must continue to resolve — there are grandfathered subscribers.

## Meta API version

Configured in `server/metaConfig.js` via `META_API_VERSION` env var (default `v25.0`). All Graph API calls should use this constant.

## Generated media

Images generated by the AI are written to `GENERATED_DIR` and served at `/api/media/:filename`. On Render without a persistent disk this is `/tmp/generated` (lost on container restart). The backend has a Sharp-based fallback image for missing files. Downstream Meta ad creation depends on these URLs being publicly reachable by Meta's servers, which is why absolute Render URLs are used for Meta, not same-origin paths.

## Twilio call tracking

Routes live in `server/routes/twilio.js`. Per-slug config (`CALL_CONFIGS`) maps tracking numbers to forwarding numbers. Call recording is controlled by `ENABLE_ASPEN_CALL_RECORDING=true` env var. Recording metadata lands in `call_tracking_events` (if matching `CallSid` found) or `call_recordings` (orphan).

## What not to touch without explicit instruction

- Stripe webhook raw body capture (`req.rawBody` in `server.js`)
- Session cookie name `sm_sid` or header `x-sm-sid`
- `ownerKey` derivation logic
- Optimizer state field names used across multiple modules
- `vercel.json` rewrite rules
- Legacy Stripe price IDs (grandfathered subscribers)
