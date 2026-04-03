# FRONTEND_ARCHITECTURE_NOTES.md

## Purpose of this document

This file is meant to give Claude Code a working mental model of the Smartemark frontend before it edits anything.

The goal is to explain:
- how the frontend is structured
- which pages are simple vs high-risk
- how routing, auth, billing, and campaign setup connect together
- how local/session storage is being used
- where the frontend is strongest
- where it is fragile
- what behavior Claude should preserve

---

# 1. Frontend mission

The Smartemark frontend is doing four jobs at once:

1. Public website / conversion layer
2. Onboarding layer
3. Campaign control layer
4. State continuity layer

A huge amount of the frontend complexity exists because Smartemark is trying to keep the user from losing work across refreshes, login, Stripe, Facebook OAuth, and navigation.

---

# 2. High-level frontend architecture

The frontend is a React SPA with `react-router-dom`, hosted on Vercel, with rewrites proxying backend traffic to Render.

Core structure:
- `src/index.js`
- `src/App.js`
- `src/pages/Landing.js`
- `src/pages/Pricing.js`
- `src/pages/FormPage.js`
- `src/pages/CampaignSetup.js`
- `src/pages/Login.js`
- `src/Signup.js`
- `src/pages/Confirmation.js`
- `src/pages/PrivacyPolicy.js`
- `Scheduler.js`
- `vercel.json`

Dominant user journey:

**Landing → Pricing / Signup / Login → FormPage → CampaignSetup → Confirmation**

---

# 3. Entry, routing, and deployment layer

## 3.1 `src/index.js`
Boot file that mounts the app and wraps it in `BrowserRouter`.

Low risk.

## 3.2 `src/App.js`
Defines the main routes:
- `/` → `Landing`
- `/pricing` → `Pricing`
- `/form` → `FormPage`
- `/setup` → `CampaignSetup`
- `/login` → `Login`
- `/signup` → `Signup`
- `/confirmation` → `Confirmation`
- `/privacy` → `PrivacyPolicy`
- `*` → `NotFound`

Also updates Google Analytics page path via `window.gtag`.

Important because the app is page-flow based, so continuity between pages must be handled manually.

## 3.3 `vercel.json`
Very important operational file.

Rewrites:
- `/api/*` → Render backend `/api/*`
- `/generated/*` → Render
- `/videos/*` → Render
- `/auth/*` → Render
- `/smart/*` → Render
- everything else → `/index.html`

Also redirects the Vercel host to `www.smartemark.com`.

This is why frontend code can use same-origin fetches like `/api/...` and `/auth/...`.

---

# 4. Page classification: simple vs complex

## Low-risk/simple pages
- `Confirmation`
- `PrivacyPolicy`
- `NotFound`

## Medium-risk pages
- `Landing`
- `Pricing`
- `Login`
- `Signup`

## High-risk pages
- `FormPage`
- `CampaignSetup`

Those two pages are the true frontend core.

---

# 5. Public website and acquisition layer

## 5.1 `Landing.js`
Public homepage / positioning page.

Does:
- presents Smartemark
- routes users to `/form`
- includes FAQ
- handles responsive behavior
- uses polished purple/light-blue visual theme

Business role:
- clarity
- trust
- conversion

Low risk structurally, but CTA destinations must remain correct.

## 5.2 `Pricing.js`
Plan selection page.

Does:
- displays Standard / Pro / Operator
- stores selected plan in localStorage
- navigates to `/signup`
- passes plan data via router state
- tracks analytics events

Important because this frames the product tiers and preserves plan context into signup.

## 5.3 `Login.js`
Existing user auth entry.

Does more than simple login:
- stable `sm_sid`
- `/auth` with fallback to `/api/auth`
- can create auth-linked checkout session
- checks billing status
- normalizes identifier
- participates in billing recovery / continuity

Medium-high risk because it bridges auth and billing.

## 5.4 `Signup.js`
New user creation + paid plan entry.

Does:
- reads selected plan from router state or localStorage
- creates or reuses stable SID
- registers the user
- falls back to login if account exists
- starts Stripe checkout session
- passes identity to backend

Important bridge between frontend account creation, backend auth, billing, and session ownership.

---

# 6. Core product flow pages

# 6.1 `FormPage.js`

This is one of the two most important frontend files.

## Core role
Creative-generation and business-input onboarding page.

User can:
- enter business info
- generate or regenerate creatives
- persist drafts
- create the state later used by `CampaignSetup`

## What it is really doing
This is not just a form. It is a state persistence and creative continuity engine.

### Major responsibilities visible in the code
- same-origin backend endpoint usage
- per-user namespaced storage
- active context tracking (`ACTIVE_CTX_KEY`)
- form draft persistence
- creative draft persistence
- image preview caching via data URLs
- creative draft purging when context changes
- cleanup of old/legacy draft keys
- image generation quota logic
- context-based restore logic
- user namespace isolation
- draft disable logic after successful launch
- cache/fallback helpers for survivable previews

## Most important concept: active context
The page uses an `ACTIVE_CTX_KEY` and context-building helpers.

This is trying to ensure:
- old creatives do not bleed into new runs
- back/forward navigation does not resurrect stale business context
- OAuth/login transitions do not attach the wrong creative set to the wrong run

## Most important concept: namespaced storage
Uses `u:<user>:<key>`.

This prevents:
- one user’s draft restoring into another’s session
- login changes hijacking old draft state
- anonymous and logged-in flows from colliding

## Most important concept: preview survivability
Caches image previews as data URLs so the user can still see previews even if generated assets disappear or URLs break.

## Why it is high risk
A small bad edit can break:
- draft restore
- creative transfer
- context separation
- preview persistence
- OAuth survival
- image cache continuity

## Claude guidance
Edit surgically.

Preserve:
- per-user namespacing
- active context behavior
- creative purge-on-new-context rules
- draft disable behavior after successful launch
- image cache backup logic
- same-origin API assumptions

Likely fragilities:
- many localStorage/sessionStorage pathways
- legacy keys and current keys coexist
- easy to accidentally re-enable stale draft restores
- state can drift when user namespace changes mid-flow

---

# 6.2 `CampaignSetup.js`

This is the other highest-risk frontend file.

## Core role
Campaign control center after creative generation.

Handles:
- auth/session continuity
- billing status checks
- Facebook connection state
- creative restore/backup
- preview restore/backup
- fetchable image backup
- launch preparation
- draft transfer from FormPage
- user namespace logic
- campaign management behavior

## What it is really doing
This page is a frontend orchestration layer.

Multiple flows converge here:
1. user identity
2. billing state
3. Facebook auth/connect
4. creative handoff
5. campaign launch readiness
6. post-launch control/dashboard behavior

## Key concept: stable SID
Uses persistent `sm_sid` fallback in localStorage and injects it into headers and query params.

This compensates for flaky cookies and keeps backend identity stable.

## Key concept: same-origin auth fetch
Prefers app-origin fetches:
- `/auth`
- `/api/auth`

This aligns with Vercel rewrites and avoids cross-origin cookie issues.

## Key concept: backup layers
Has multiple backup systems for:
- creatives
- preview text
- fetchable image URLs
- inflight Facebook connect state
- launch intent state

This is there to survive:
- Facebook OAuth redirect
- back button
- refresh
- login changes
- missing local generated assets
- namespace mismatch

## Why it is fragile
Because it is doing too many jobs:
- UI
- auth continuity
- creative continuity
- billing continuity
- campaign lifecycle continuity

Symptoms from bugs here look like:
- creatives disappeared
- billing not showing
- had to make a new account
- Facebook reconnect broke setup
- stale drafts came back
- launch used old creatives

## Claude guidance
Narrow, flow-aware edits only.

Preserve:
- SID persistence
- preview and image backup behavior
- fetchable-image restore logic
- user namespacing
- draft-disable behavior
- active context protections
- same-origin `/auth` and `/api` assumptions

Likely fragilities:
- multiple restore layers can conflict
- legacy keys and current keys coexist
- namespace switching is easy to mishandle
- OAuth reconnects can revive stale state if context checks weaken

---

# 7. Data continuity strategy across the frontend

A major theme is state survivability.

The frontend is designed around users who may:
- refresh
- go back
- sign in mid-flow
- hit Stripe
- hit Facebook OAuth
- return with partial state
- use the same browser for multiple identities

To survive that, the app uses:

## 7.1 localStorage
For:
- selected plan
- SID fallback
- drafts
- creative backups
- image cache
- preview backup
- flags
- user namespace

## 7.2 sessionStorage
For:
- active per-session context
- user-scoped draft disable flags
- active context values
- intermediate session-only state

## 7.3 namespacing
Using `u:<user>:...`

## 7.4 active context keys
To avoid stale run contamination.

## 7.5 backup/fallback layers
To keep previews and creatives restorable.

Conclusion:
The frontend relies heavily on browser persistence as part of product correctness.

---

# 8. Supporting frontend files

## 8.1 `Confirmation.js`
Simple success page after campaign launch.

Low risk.

## 8.2 `PrivacyPolicy.js`
Static legal/info page.

Low risk.

## 8.3 `Scheduler.js`
Browser-tab scheduler utility.

Important note:
It literally says the tab must stay open, stores jobs in localStorage, and executes timed POST requests from the browser.

This is not the real production scheduling system. The real scheduling architecture lives in the backend optimizer scheduler/autorunner.

## 8.4 `reportWebVitals.js`
Standard CRA-style performance helper.

Low risk.

---

# 9. Biggest frontend strengths

1. Strong continuity thinking
2. Namespaced storage
3. Active context separation
4. Same-origin proxy architecture
5. Clear funnel shape

---

# 10. Biggest frontend fragilities

1. Too much logic in `FormPage`
2. Too much logic in `CampaignSetup`
3. Legacy and current storage keys coexist
4. Browser storage is part of correctness
5. Auth/billing/Facebook continuity is partly frontend-managed

---

# 11. What Claude should preserve

Claude should preserve these non-negotiables:

1. FormPage → CampaignSetup handoff
2. User namespacing
3. Active context protection
4. Draft disable after successful launch
5. SID stability
6. Same-origin fetch pattern
7. Plan continuity

---

# 12. What Claude can safely improve first

Best initial targets:
- reduce duplication in helper logic without changing behavior
- improve comments around storage layers
- improve guard clarity in FormPage/CampaignSetup
- make restore precedence more explicit
- improve UI-level error messaging
- improve frontend explanation of billing/auth/Facebook state

Higher-risk areas:
- changing key names
- removing legacy fallback behavior
- rewriting creative restore logic
- changing SID storage behavior
- changing route flow between signup/login/setup
- changing fetch base assumptions

---

# 13. Immediate frontend mission

The frontend’s immediate mission is:
- more stable
- more explainable
- less likely to revive stale state
- more reliable across login/Stripe/OAuth transitions
- better aligned with the autonomous campaign control experience

---

# 14. Final instruction block for Claude Code

When working in the frontend, Claude should:
- read this file first
- inspect both `FormPage` and `CampaignSetup` before changing either one
- preserve storage namespacing
- preserve active context logic
- preserve draft disable logic
- preserve same-origin fetch behavior
- preserve pricing → signup/login → setup continuity
- preserve FormPage → CampaignSetup creative transfer
- make the smallest safe change first
- trace storage read/write flow before editing
- not remove fallback logic just because it looks redundant

---

# 15. Bottom line

The Smartemark frontend is a conversion funnel + onboarding engine + continuity system + campaign control UI.

Its two real architectural cores are:
- `FormPage`
- `CampaignSetup`

Everything else is supporting structure around those two pages.

Claude should treat the frontend as a working but delicate continuity-driven product shell.
