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
| `fb_selections` | Saved Facebook ad account + page per ownerKey |
| `campaign_drafts` | PAUSED Meta campaigns created for review before launch |

On Render, `DATA_DIR` defaults to `/var/data/smartmark` (persistent disk) or `/tmp` (ephemeral). Locally it uses `server/data/`.

## Identity: ownerKey and sm_sid

The most important backend concept. Every user-owned resource (FB token, optimizer state, FB selection, etc.) is keyed by an `ownerKey`:
- Format `user:<username>` when a session is linked to a logged-in user
- Falls back to the raw session SID string when not linked

Session SID (`sm_sid`) is set as a cookie **and** stored in `localStorage` under key `sm_sid_v1`. The frontend injects it as the `x-sm-sid` header on every auth fetch as a cookie fallback. Backend reads it from cookie → header → query param in that priority order.

**Do not change ownerKey generation logic or SID persistence** — token and campaign ownership depends on it surviving OAuth redirects, Stripe redirects, and page refreshes.

## Admin-client isolation

TheBoss (admin) can manage individual clients (e.g. Max at `powermaxgen@yahoo.com`) via `?adminClientId=powermaxgen@yahoo.com` in the URL. This mode has strict isolation rules that span both frontend and backend.

### How each page resolves adminClientId

**FormPage.js** — URL-only, no localStorage fallback:
```js
const adminClientId = useMemo(
  () => new URLSearchParams(location.search).get("adminClientId") || "",
  [location.search]
);
```
Route state is *not* checked. If the URL doesn't contain `?adminClientId=`, FormPage will be in TheBoss normal mode regardless of what's in localStorage or route state.

**CampaignSetup.js** — URL query param only (same rule as FormPage):
```js
// URL is the ONLY authority. Clean /setup = TheBoss mode, always.
const adminClientId = useMemo(() => {
  try { return new URLSearchParams(location.search || "").get("adminClientId") || ""; }
  catch { return ""; }
}, [location.search]);

// Route state may carry supplemental data (business name, images) but ONLY
// trust it when it matches the URL's adminClientId.
const routeStateAdminClientId = String(state.adminClientId || "").trim();
const routeStateMatchesClient = !!(adminClientId && routeStateAdminClientId === adminClientId);
```
If the URL is `/setup` with no query param, `adminClientId === ""` unconditionally — even if `location.state.adminClientId` is non-empty.

### Navigation must preserve adminClientId in the URL

**Every** navigate call to `/form` or `/setup` must include `?adminClientId=<id>` in the URL path when in admin mode. Both pages now share a `withAdminClientQuery` helper:

```js
function withAdminClientQuery(path, adminClientId) {
  if (!adminClientId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}adminClientId=${encodeURIComponent(adminClientId)}`;
}

// Usage — always wrap navigate paths:
navigate(withAdminClientQuery("/form", adminClientId));
navigate(withAdminClientQuery("/setup", adminClientId), { state: { ... } });
```

FormPage also reads a `?creativeMode=ai_image|upload_photo|upload_video` URL param, written by CampaignSetup's 3-dot creative-replace menu, to pre-select the creative pill on arrival.

### sm_admin_target_client_id localStorage key
Written when entering admin mode. `exitClientMode()` explicitly removes it. It is **not** used as a fallback for adminClientId resolution in either page — the URL is authoritative. Never use this key to force admin-client mode.

### Backend ownerKey routing
When `adminClientId` is present in a request body or query, backend routes resolve the ownerKey as `user:<adminClientId>` (the client's key), not the admin's key. This applies to:
- `POST /api/facebook/selection` — saves under the client's ownerKey
- `GET /api/facebook/selection?adminClientId=...` — reads from the client's ownerKey
- `POST /api/facebook/create-draft` / `launch-draft` — uses client's FB token
- Facebook OAuth callback — when `state.adminClientId` is present and requester is verified admin, token is stored under `user:<adminClientId>` only (not under the admin's SID)

### Frontend storage namespacing
All per-user localStorage keys follow the pattern `u:<namespace>:<key>`. The namespace depends on context:

| Context | Namespace | Example key |
|---|---|---|
| Logged-in TheBoss own dashboard | `u:TheBoss:key` | `u:TheBoss:draft_form_creatives_v3` |
| Admin managing Max | `u:adminClient:powermaxgen@yahoo.com:key` | `u:adminClient:powermaxgen@yahoo.com:draft_form_creatives_v3` |
| Anonymous session | `u:anon:key` or `u:<sid>:key` | — |

**Never write client data to TheBoss's namespace, the bare (non-namespaced) key, or another client's namespace.**

### FormPage namespacing
`FormPage.js` uses `getUserNS()` (reads `sm_user_ns_v1`) to build `u:<ns>:key` via `nsKey(baseKey)`. In admin mode, the raw `lsSet`/`ssSet` wrappers would write to TheBoss's namespace. For creative draft keys specifically, admin-mode writes must use explicit `localStorage.setItem("u:adminClient:" + adminClientId + ":" + key, ...)`.

### CampaignSetup isolation
- `adminClientId` is a `useMemo` computed from `location.search` only — not from route state, not from localStorage
- Draft re-hydration reads from `u:adminClient:<id>:*` in admin mode, then `return`s early — never touches TheBoss's keys; `applyDraft()` also rejects drafts whose `adminClientId` field doesn't match the current URL context
- When `adminClientId` transitions from non-empty to `""`, the `_prevAdminClientIdRef` effect clears all client-derived React state immediately (accounts, pages, campaigns, maps, `draftCreatives`, `previewCopy`, `facebookConnectionStatus`)
- `isExitingAdminClientModeRef` (a `useRef`) is set to `true` in `exitClientMode()` before state clears, checked in the server-save effect to skip race-window writes
- CampaignSetup has a 3-dot creative-replace menu (`creativeMenuOpen` + `creativeReplaceConfirm` state) that navigates to FormPage with `?creativeMode=` pre-selection; live-campaign replacements show a stronger confirm and alert that live Meta ad mutation is not yet automatic

### Login namespace cleanup
`Login.js` clears stale bare/legacy selection keys on every successful login:
- Removes `smartmark_last_selected_account`, `smartmark_last_selected_pageId`, `smartmark_fb_connected`
- Sets `sm_user_ns_v1` to `backendUsername` so `lsGet` fallbacks point to the right user

## Facebook connection and selection

### Connection state machine
`CampaignSetup.js` maintains two FB states:
- `fbConnected` (boolean) — only set to `false` when `GET /auth/facebook/status` returns `{ tokenPresent: true, expired: true }`. Never cleared on mere network failure or `connected: false` without a confirmed expired token.
- `facebookConnectionStatus` (`"checking" | "connected" | "expired" | "not_connected" | "error"`) — drives UI copy without touching `fbConnected`

### Selection persistence
`server/routes/facebook.js` handles `GET/POST /api/facebook/selection`. Selections (ad account + page) are saved to `db.data.fb_selections` keyed by `ownerKey`. The frontend save effect includes a critical race guard: it checks that `selectedAccount` is actually in the currently-loaded `adAccounts` list before writing, preventing client selections from being written under TheBoss's ownerKey during the exit transition.

### Facebook token storage
`server/tokenStore.js` owns all FB token reads/writes. It wraps LowDB with an in-memory cache. Always use its exported functions (`getFbUserToken`, `setFbUserToken`, etc.) — never read `db.data.tokens` directly. Tokens are per-ownerKey; the legacy single-token path (`db.data.tokens.fbUserToken`) still exists for backward compatibility.

### Facebook status endpoint
`GET /auth/facebook/status` calls `await db.read()` first (fixes Render cold-start cache miss) and returns explicit `{ tokenPresent, expired, connected }` booleans. It does **not** delete the token on expiry check — token cleanup is user-initiated.

### OAuth admin-client flow
When admin connects FB for a client, the frontend passes `adminClientId` in the OAuth start URL. It is embedded in the HMAC-signed state payload (`makeOAuthState({ ..., adminClientId })`). The callback verifies admin status, looks up the client user, and stores the token under `user:<clientUsername>` only — never under the admin's SID or `user:TheBoss`.

## Creative draft persistence

### Key names
- `CREATIVE_DRAFT_KEY = "draft_form_creatives_v3"` — primary draft
- `"sm_setup_creatives_backup_v1"` — backup
- `"draft_form_creatives"` — sessionStorage version

### Namespace rule
| Mode | FormPage writes to | CampaignSetup reads from |
|---|---|---|
| Normal user | `u:<getUserNS()>:draft_form_creatives_v3` via `lsSet()` | `u:<resolvedUser>:draft_form_creatives_v3` via `lsGet()` |
| Admin client | `u:adminClient:<id>:draft_form_creatives_v3` (explicit write) | `u:adminClient:<id>:draft_form_creatives_v3` (explicit read, then `return`) |

### Draft payload fields
Drafts carry `{ ctxKey, adminClientId?, savedAt, expiresAt, images, mediaSelection, ... }`. The `adminClientId` field is written when the draft was created in admin-client mode.

### Wrong-client draft rejection rules
Before applying a draft, check both fields:
1. **Admin mode** (`currentAdminClientId` is set): reject any draft where `draft.adminClientId !== currentAdminClientId`.
2. **Normal mode** (no `currentAdminClientId`): reject any draft where `draft.adminClientId` is non-empty.
3. Log rejections: `console.debug("[Creative Draft Rejected - wrong client]", { currentAdminClientId, draftAdminClientId, ctxKey })`.

`applyDraft()` in CampaignSetup also calls `isDraftForActiveCtx(draftObj, resolvedUser)` which compares `draftObj.ctxKey` against the active context key. If the active context is empty, the ctxKey check passes unconditionally.

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
| `server/routes/auth.js` | Identity + FB connect + optimizer wiring + Meta API logging — 5 jobs in one file; FB OAuth callback stores tokens and must preserve admin-client vs normal-user paths |
| `src/pages/CampaignSetup.js` | Auth/billing/FB/creative/launch continuity all converge here; admin-client isolation logic is spread across many effects |
| `src/pages/FormPage.js` | Creative draft persistence, user namespace (`getUserNS()`/`nsKey()`), active context key, AI image confirmation flow (`awaitingAiImageConfirm` + `triggerAiImageGeneration()`), compact creative pills in preview header |
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
- `CALL_CONFIGS` in `twilio.js` — live client numbers
