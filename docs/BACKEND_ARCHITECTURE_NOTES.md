# BACKEND_ARCHITECTURE_NOTES.md

## Purpose of this document

This file is meant to give Claude Code a **high-context map of the Smartemark backend** before it edits anything.

The goal is not to dump raw code into documentation.  
The goal is to explain:

- what the backend is trying to do
- which files are likely core vs secondary vs legacy/transitional
- how data moves through the backend
- where the current architecture is strong
- where it is fragile
- what Claude should preserve when making changes

---

# 1. Backend mission

Smartemark’s backend is no longer just a simple “launch ads” backend.

It is evolving into a backend for an **AI-assisted Meta ads operating system** with four major responsibilities:

1. **Identity and account ownership**
   - signup/login/session persistence
   - user-to-session binding
   - billing-to-user binding
   - Facebook token ownership binding

2. **Commercial access control**
   - plan selection
   - Stripe checkout/subscription syncing
   - access gating
   - plan-based limits

3. **Campaign launch + creative infrastructure**
   - media uploads
   - static creative hosting
   - GPT/OpenAI helpers
   - Meta launch and mutation calls

4. **Autonomous optimizer loop**
   - sync metrics
   - diagnose performance
   - decide next action
   - execute action
   - monitor result
   - optionally repeat on schedule

That means the backend is not a normal CRUD backend anymore.  
It is closer to an **application backend + lightweight AI agent runtime + state machine**.

---

# 2. High-level backend shape

The backend appears to be organized around these major layers:

## A. HTTP / Express server layer
Main server boot, middleware, CORS, JSON parsing, static files, route mounting.

**Primary file:**
- `server/server.js`

## B. Route layer
Business-facing API routes.

Known major route modules from the provided files:
- `server/routes/auth.js`
- `server/routes/stripe.js`
- `server/routes/gpt.js`
- legacy/simple campaign router snippet
- mock/testing router for smart engine

## C. External integration layer
Interfaces to:
- Meta Graph API
- Stripe
- OpenAI
- generated media filesystem

## D. Optimizer / agent layer
Files that together form the autonomous marketer loop:
- optimizer campaign state store
- metrics sync
- diagnosis
- decision
- action
- monitoring
- public summary
- orchestrator
- scheduler
- autorunner
- copy generation helpers
- “brain” files using OpenAI

## E. Persistence layer
The backend appears to rely heavily on **LowDB** or a similar file-backed JSON DB abstraction through `../db`.

This means most state is being stored in JSON collections inside the backend runtime rather than a relational database.

---

# 3. Most important active backend files

## 3.1 `server/server.js`
This is the runtime entrypoint.

### What it is doing
This file is responsible for:
- loading environment variables
- configuring global crash handlers
- setting memory-related process behavior
- booting Express
- enabling CORS and cookie parsing
- parsing large JSON and form payloads
- exposing generated media files
- handling image upload conversion
- likely mounting the rest of the backend routers

### Why it matters
This file is the foundation of the whole backend.  
If this file is wrong, everything above it becomes unstable.

### Important architectural signals
- It uses **broad CORS behavior**, allowing origin reflection and credentials.
- It increases payload limits to support large AI/media payloads.
- It supports generated files through `/api/media/...`
- It stores generated files in:
  - `/tmp/generated` on Render
  - `server/public/generated` locally

### What this means for Claude
Claude should treat `server.js` as a **sensitive infrastructure file**.  
Do not casually refactor it unless there is a real reason.

### Fragile points
- Broad CORS is practical for MVP speed, but it increases risk of origin/cookie complexity.
- Large body limits can mask oversized requests and memory pressure.
- Generated file storage is filesystem-based, so persistence behavior may differ by environment.
- Middleware ordering matters a lot here. A change in route order could silently break uploads or Stripe webhook raw body handling.

---

## 3.2 `server/routes/auth.js`
This is one of the most important backend files in the whole project.

### Core role
Despite the filename `auth.js`, this file is much more than basic auth.

It appears to be the main **identity + Meta connection + optimizer control surface**.

### What this file appears to handle
Based on the provided code, this route file includes logic for:
- session handling via `sm_sid`
- cookie/session fallback behavior
- owner key resolution
- Facebook token lookup/storage
- Facebook connection status
- fetching and caching ad accounts/pages
- user/session linking
- optimizer state access
- optimizer cycle helpers
- Meta API usage logging
- debugging helpers
- launch plan normalization and limits

### Why this file is central
This file acts like the backend’s **control tower**:
- who the user is
- which Facebook token belongs to them
- which ad account/page is “their default”
- which campaign states belong to them
- which optimizer functions can run on their assets

### Key architectural concept: `ownerKey`
One of the most important backend concepts is the **owner key**.

The code strongly suggests Smartemark uses an `ownerKey` abstraction to associate:
- sessions
- users
- Facebook tokens
- optimizer campaign states

This is extremely important because the system seems designed to work even when:
- a user is not fully signed in yet
- a session exists before permanent account linkage
- Meta assets get connected before the account lifecycle is perfectly clean

### Session model
The file uses:
- cookie name: `sm_sid`
- header fallback: `x-sm-sid`
- optional query fallback
- bearer fallback

This means Smartemark’s session resolution is deliberately flexible.

### What problem this solves
It allows the product to survive cases like:
- user starts onboarding before full signup completion
- frontend reloads during onboarding
- Meta connect flow redirects back with partial state
- Stripe/account state needs to reunify around session identity

### Meta API tracker inside auth
This file also contains a Meta API usage tracker.

That is not normal “auth file” behavior.  
It means this file became a home for:
- Graph API instrumentation
- qualified marketing call logging
- review/compliance support
- per-call labeling
- persistence of Meta API usage rows

This is useful for Meta review and debugging, but it also means the file is overloaded.

### Biggest architectural reality
`auth.js` is doing at least **five jobs**:
1. auth/session handling
2. Facebook connection handling
3. owner identity resolution
4. optimizer support wiring
5. Meta API logging/instrumentation

This makes it extremely powerful, but also extremely fragile.

### Claude guidance
Claude should **not** broadly reorganize this file in one shot.  
Small changes only.

Any modification to:
- SID resolution
- owner key generation
- session cookie setting
- token ownership logic
must be treated as high risk.

### Fragile points
- Too many concerns inside one file.
- Session and user identity can drift if write paths are inconsistent.
- Cookie + header + query fallback logic can make bugs subtle.
- If `ownerKey` logic changes incorrectly, campaigns/tokens can appear to “belong to nobody” or the wrong session.
- This file likely became the place where many urgent MVP fixes were patched in; Claude must assume some strange-looking logic may be preserving a real production behavior.

---

## 3.3 `server/routes/stripe.js`
This file handles billing state and user billing identity.

### Core role
This is the backend bridge between:
- Stripe checkout/subscription state
- Smartemark user accounts
- session-based identity
- plan metadata

### What it does
From the provided code, this file includes:
- Stripe client setup
- plan key normalization
- price ID to plan metadata lookup
- session-to-user resolution
- user billing patching
- customer/subscription syncing
- account auto-creation when Stripe completes but user record is missing

### Why this file matters
Smartemark’s product flow depends on this file being correct because:
- access is tied to plan
- plan affects limits
- onboarding must not lose billing state
- a user returning from Stripe must still be recognized

### Important architectural behavior
The file appears to intentionally tolerate imperfect signup/account flows by doing things like:
- searching by username
- searching by email
- searching by Stripe customer ID
- searching by Stripe subscription ID
- auto-creating user records from email if needed

That is very revealing.

### What that means
This backend is designed to be **forgiving** about identity mismatches because the commercial flow matters more than rigid purity right now.

That is likely the right MVP tradeoff.

### Good part
This increases the chance that a paying user still gets access even if account creation flow was imperfect.

### Risk
It can also create identity duplication or unclear canonical identity if not carefully controlled.

### Claude guidance
Claude should preserve the business intent:
> “If Stripe succeeded, do not let the customer lose access just because identity binding is imperfect.”

Do not rewrite Stripe binding with a rigid assumption that a single perfect user record already exists.

### Fragile points
- Multiple identity keys can create duplicate users if normalization is inconsistent.
- Session identity and billing identity may drift apart.
- If plan metadata mapping changes incorrectly, access logic will silently break.
- Hidden founder plan logic and public price mapping should be preserved carefully.

---

## 3.4 `server/routes/gpt.js`
This is the user-facing GPT helper router.

### Core role
This file appears to power in-app AI text generation utilities, including:
- chat assistant behavior
- concise AI ad manager messaging
- subline/copy generation helpers
- rate-limited protected endpoints

### Not the same as optimizer brain
This file is **not** the autonomous optimizer brain.  
It is more like the **frontend/user-experience GPT layer**.

### What it does well
- has basic security middleware
- rate limits routes
- constrains chat behavior
- keeps answers short
- aligns the assistant with UI expectations

### Why it matters
This file powers product polish:
- the AI manager feeling
- copy/help text
- controlled user-facing assistant responses

### Claude guidance
Do not confuse this with the deeper optimizer logic.  
This is the “UI assistant” layer, not the “agent decision engine” layer.

### Fragile points
- Tight UX constraints matter here.
- If prompt behavior changes too broadly, Smartemark may start asking users questions the UI is supposed to handle.
- Rate limits and response shaping should remain intact.

---

## 3.5 Static ad / image generation route
The uploaded route file for image generation and media handling appears to be a backend utility for:
- generating images through OpenAI
- saving generated images to disk
- exposing them through Smartemark media endpoints
- building creative prompts/variants

### Why this matters
This is part of the campaign-creative production pipeline.  
It gives Smartemark a way to:
- generate creative assets
- host them itself
- later use them in Meta ad creation or testing

### Important architecture note
This route is not just “image generation.”  
It is part of the larger ad-ops backend.

### Fragile points
- filesystem reliance
- upstream timeout behavior
- output format assumptions
- prompt variant logic can directly affect ad testing quality

### Claude guidance
Preserve:
- URL normalization behavior
- filesystem save behavior
- generated asset serving assumptions
because downstream campaign logic likely depends on those image URLs being stable.

---

## 3.6 `server/smartCampaignEngine/index.js`
This is one of the foundational engine files.

### Core role
This appears to be the lower-level Meta campaign execution engine.

### What it includes
Based on the provided snippet, it contains:
- Meta Graph helpers (`fbGetV`, `fbPostV`)
- public URL normalization helpers
- image URL extraction/normalization
- global policy config
- dry-run / validation toggles
- variant planning rules
- testing mocks/hooks

### Key interpretation
This file looks like the **campaign execution policy engine**, not the whole optimizer brain.

It is more operational and platform-facing.

### Why it matters
This file defines how Smartemark interacts with Meta in concrete terms:
- what requests look like
- what policies exist around testing
- how variant counts are decided
- how validation-only and no-spend modes behave

### Important business meaning
This file is where Smartemark’s product philosophy starts becoming executable policy:
- do measured testing
- cap variants
- avoid over-generation
- respect thresholds

### Claude guidance
This file is highly important for future autonomous behavior.  
It should be expanded carefully, not randomly simplified.

---

# 4. Optimizer architecture: the real “brain loop”

The most important backend evolution is the optimizer pipeline.

The optimizer system appears to be built from modular files, each responsible for a stage in the loop.

The current target loop is:

**Sync Metrics → Diagnose → Decide → Act → Monitor → Summarize → Repeat**

This is the clearest high-level interpretation of the backend.

---

## 4.1 `optimizerCampaignState.js`
This is the optimizer’s persistent state store.

### Core role
This file manages the collection `optimizer_campaign_state` in the JSON database.

### Why this file is critical
This is effectively the **memory and truth layer** for each campaign being managed by the optimizer.

### What a campaign state record appears to hold
A record can include:
- campaign identifiers
- Meta campaign ID
- account ID
- owner key
- page ID
- campaign name
- niche
- current status
- optimization enabled flag
- billing blocked flag
- metrics snapshot
- latest diagnosis
- latest decision
- latest action
- latest monitoring decision
- public summary
- manual override data
- pending creative test data
- creative variants and related metadata
- timestamps

### Architectural meaning
The optimizer is **stateful**, not purely event-driven.

That is important.

It means the system can remember:
- what it diagnosed last
- what it decided last
- what action was executed
- whether a creative test is live/ready/resolved
- whether manual override is active

### Why this is good
It lets Smartemark behave like an operator rather than a stateless script.

### Fragile points
- LowDB JSON store means concurrency is limited.
- State schema discipline matters a lot.
- If one module writes malformed objects, later modules may misinterpret state.
- This file is foundational for all optimizer modules.

### Claude guidance
If Claude edits optimizer logic, it must preserve state shape compatibility.  
Do not casually rename fields that other modules depend on.

---

## 4.2 `optimizerMetricsSync.js`
This file syncs Meta performance into optimizer state.

### Core role
Fetch live campaign insights from Meta and normalize them into a canonical snapshot.

### What it does
- calls Meta insights endpoint
- reads impressions, clicks, spend, cpm, cpp, ctr, actions, reach, unique clicks
- derives:
  - link clicks
  - conversions
  - cpc
  - frequency
  - conversion rate
  - cost per conversion
- stores a normalized snapshot into optimizer campaign state

### Architectural value
This file is important because it creates the **shared numerical vocabulary** for the rest of the optimizer.

Diagnosis, decision, and monitoring all depend on this normalization.

### Why it matters
Without a stable normalized metrics snapshot, every downstream module would reason differently.

### Claude guidance
Any change here can ripple through the whole optimizer.  
Be conservative.

### Fragile points
- Action type extraction from Meta actions arrays may need future refinement.
- Current conversion definitions are heuristic and should remain consistent unless intentionally revised.
- If metrics naming changes here, diagnosis and monitoring may silently degrade.

---

## 4.3 `optimizerDiagnosis.js`
This file appears to be the diagnosis layer.

### Two-level behavior
It likely has:
1. a fallback rule-based diagnosis path
2. an AI diagnosis path via `optimizerBrain`

### What diagnosis is trying to answer
Not “what should we do immediately?”  
First: **what is the actual problem pattern?**

Examples from the allowed diagnoses:
- billing_blocked
- scheduled_not_started
- no_delivery
- insufficient_data
- weak_engagement
- low_ctr
- post_click_conversion_gap
- creative_fatigue_risk
- high_cpc
- healthy_early_signal
- no_data

### Why this is a good architecture
This is clean separation:
- diagnosis describes the situation
- decision chooses the next move

That separation is important for future agent quality.

### Claude guidance
Preserve this split.  
Do not collapse diagnosis and decision into one messy prompt.

---

## 4.4 `optimizerBrain` / AI diagnosis engine
The provided “brain” code uses OpenAI to return structured JSON diagnosis output.

### What it does
- sends optimizer state + creative context into an LLM
- restricts outputs to allowed diagnoses
- restricts outputs to allowed recommended actions
- demands structured JSON
- clamps/normalizes results

### Why this matters
This is the beginning of Smartemark’s actual autonomous reasoning layer.

### Good architectural choice
The allowed-value restriction is smart because it keeps LLM behavior bounded.

### Claude guidance
This is a good file to improve gradually:
- richer context
- better prompt quality
- improved output validation
- more nuanced thresholds
But do not remove the structured output discipline.

---

## 4.5 `optimizerDecision.js`
This file is the decision layer.

### Core role
Turn the diagnosis + campaign context + monitoring status into a concrete next move.

### Important conceptual difference
Diagnosis says:
> “This campaign has a low CTR problem.”

Decision says:
> “The next safest high-leverage move is update_primary_text”  
or  
> “promote generated creative variants”  
or  
> “continue monitoring”

### Current architecture pattern
This file appears to use:
- fallback rule-based decision logic
- optional AI decision support via optimizer brain
- strong handling for:
  - delivery restore
  - post-refresh waiting
  - pending generated creative promotion
  - live creative test resolution

### Why this is strong
The decision layer is already showing signs of becoming a proper state machine.

It is not just “if low ctr then do x.”  
It also considers:
- what was already done
- whether a test is live
- whether generated assets are already ready
- whether monitoring says wait

### Claude guidance
This file is high-value for future improvements.  
It should become smarter, but still deterministic enough to be trustworthy.

---

## 4.6 `optimizerAction.js`
This is the mutation layer.

### Core role
Actually perform or stage the chosen action.

### Based on the uploaded snippet
This file appears to handle:
- campaign status checks
- mutation blocking under manual override
- creative test guardrails
- plan-based action limits
- creative generation planning
- business context inference
- prompt context for creative generation
- likely actual Meta mutation calls and/or internal creative-generation requests

### Why it matters
This file is where Smartemark stops being a dashboard and becomes an operator.

### Important interpretation
This is probably the most dangerous file in the optimizer stack because this is where:
- ads can be created
- text can be changed
- campaigns can be unpaused
- new challenger creatives can be generated/promoted

### Positive architectural signs
- manual override blocking exists
- plan-aware action limits exist
- creative guardrails exist
- live test resolution logic appears respected
- minimum creative test hours are enforced in plan logic

### Claude guidance
Treat this as a **surgical file**.  
Changes here should be tiny and deliberate.

### Fragile points
- Wrong action execution can spam ad variants.
- Wrong guard logic can cause endless creative generation.
- Wrong plan limit logic can break tier trust.
- Wrong state updates can make the optimizer believe a test is live when it isn’t.

---

## 4.7 `optimizerMonitoring.js`
This is the post-action observer.

### Core role
Check what happened after the latest action and decide whether:
- the action is still gathering signal
- delivery is blocked
- a creative test is active
- a test is resolved
- Smartemark should wait or react

### Why this matters
Without monitoring, the optimizer would mutate too fast and thrash the campaign.

### What this file is doing well
It appears to recognize:
- manual override
- no action to monitor
- creative test states
- elapsed time since action
- thresholds for impressions, clicks, spend, and test duration

### Architectural role
Monitoring is the **brake pedal** of the system.

Diagnosis and decision want to move the system.  
Monitoring prevents reckless overreaction.

### Claude guidance
This file is extremely important for protecting campaign stability.  
Do not weaken the “wait for more signal” behavior casually.

---

## 4.8 `optimizerPublicSummary.js`
This is the user-facing translation layer for optimizer state.

### Core role
Convert internal optimizer state into a human-readable status summary for the frontend.

### Why it matters
This is how Smartemark explains itself to the user without exposing all raw agent internals.

### Architectural meaning
This file separates:
- internal machine reasoning
from
- outward product communication

That is a very good design choice.

### Claude guidance
Preserve the split between internal state and public summary.  
The frontend should not need to decode raw diagnosis/decision/action blobs everywhere.

---

## 4.9 `optimizerOrchestrator.js`
This is the top-level optimizer coordinator.

### Core role
Run the full cycle in order.

### Based on the snippet
The orchestrator does something like:
1. sync metrics
2. reload state
3. load creative record
4. build diagnosis
5. persist diagnosis
6. reload state
7. build decision
8. persist decision
9. execute action
10. persist action
11. build monitoring
12. persist monitoring
13. maybe decide again after monitoring
14. maybe second action
15. finish cycle

### Why this file is crucial
This file defines the optimizer’s actual lifecycle.

### Architectural significance
This is the closest thing Smartemark has to an autonomous operating loop runtime.

### Claude guidance
This is a strategic file.  
If Claude edits it, it must preserve:
- stage ordering
- state reloads between stages
- persistence boundaries
- idempotency assumptions

---

## 4.10 `optimizerScheduler.js`
This file decides which campaigns are eligible for a scheduled run.

### Core role
Scan all optimizer states and decide what is ready to be processed.

### What it considers
Based on the snippet:
- optimization enabled
- billing blocked
- manual override
- missing identity fields
- last run time
- ready creative promotion
- live creative tests
- resolved tests
- minimum gap between runs

### Why it matters
This is the queue gatekeeper for the autonomous system.

### Architectural role
If the orchestrator is the engine, the scheduler is the dispatcher.

### Claude guidance
This file is central for future scaling.  
It should remain conservative and explicit.

---

## 4.11 `optimizerAutoRunner.js`
This file runs scheduled passes automatically.

### Core role
Start an interval-based background loop when enabled by env vars.

### What it does
- checks if autorun is enabled
- reads interval and limits from env
- prevents overlapping runs with a `running` flag
- invokes `runScheduledPass`
- logs outcomes

### Why it matters
This is how Smartemark transitions from manual operator tooling into an autonomous recurring service.

### Good sign
It includes overlap protection, which is important.

### Fragile point
This is still in-process scheduling.  
That is acceptable for MVP, but it is not a hardened distributed job system.

### Claude guidance
Do not over-engineer this yet, but understand its limitations.

---

## 4.12 `optimizerCopy.js`
This is the copy refresh helper.

### Core role
Generate updated primary text using simple rule-based logic.

### Interpretation
This file is a lightweight tactical helper, not the main reasoning engine.

### What it does
It looks at:
- diagnosis
- monitoring decision
- campaign/niche
- metrics context

Then picks a copy angle like:
- stronger hook
- soft refresh
- clarity

### Why it matters
It gives the action layer a quick way to produce revised messaging.

### Claude guidance
This is a decent file for future improvement, but it should stay connected to the larger diagnosis/decision context.

---

# 5. Likely legacy, transitional, duplicated, or less central files

## 5.1 Small LowDB campaign router (`save-campaign`, `user-campaigns`, etc.)
The first pasted route snippet stores campaigns directly in `db.data.campaigns` with:
- save
- list by username
- get by id
- delete by id

### Why it looks legacy or lower priority
This route is much simpler than the optimizer state architecture and appears focused on a basic saved-campaign model.

### Likely reality
It may still be used somewhere, but it does not appear to be the strategic core of the current autonomous backend.

### Claude guidance
Do not assume this file is central to the optimizer architecture.  
Verify frontend usage before editing.

---

## 5.2 Smart engine mock/testing router
The `/smart/mock/insights` and `/smart/mock/clear` router is clearly a testing support surface.

### Why it matters
Useful for controlled engine testing.

### Why it is not core product runtime
It is a testing hook, not a core customer-facing flow.

### Claude guidance
Leave it alone unless debugging optimizer behavior.

---

## 5.3 Duplicate-looking files
The uploaded snippets suggest there may be duplicated or near-duplicated logic for:
- optimizer brain diagnosis
- optimizer public summary

That could mean:
- duplicate files
- copied iterations
- transitional versions
- file paste duplication in the chat

### Claude guidance
Before editing, Claude should confirm actual repo filenames and imports rather than assuming both versions are active.

---

# 6. Core backend data flows

## 6.1 User / session / identity flow
High-level flow:
1. user enters app
2. session SID may be created before full auth
3. user may sign up / log in / return from Stripe / return from Meta
4. backend resolves current SID and possibly associated username
5. backend uses owner key abstraction to attach resources

### Why this matters
Smartemark is optimized for survivable onboarding rather than perfect rigid identity from the first request.

---

## 6.2 Billing flow
1. user selects plan
2. Stripe checkout/session occurs
3. Stripe result returns
4. backend maps Stripe customer/subscription/price to Smartemark user
5. billing fields update user record
6. plan access and plan limits become available to downstream systems

### Important business constraint
If Stripe succeeded, the system should try very hard not to orphan the customer.

---

## 6.3 Meta connect flow
1. session/user initiates Facebook connection
2. token is stored under owner key
3. backend fetches ad accounts/pages
4. defaults are cached
5. frontend can read connection status and available assets

### Why this matters
Everything campaign-related depends on correct token ownership.

---

## 6.4 Campaign optimizer flow
1. campaign exists in optimizer state
2. metrics sync fetches latest Meta performance
3. diagnosis explains what problem is present
4. decision selects the next move
5. action executes or stages the move
6. monitoring evaluates what happened after action
7. public summary translates current machine state for UI
8. scheduler/autorunner may run the cycle again later

---

# 7. Biggest current architectural strengths

## Strength 1: Clear optimizer phase separation
The backend is not one giant “AI function.”  
It separates diagnosis, decision, action, and monitoring.

That is exactly the right direction.

## Strength 2: Persistent optimizer state
The system remembers prior actions and pending tests.

That is essential for autonomous behavior.

## Strength 3: Plan-aware constraints
Plan limits are being enforced in multiple places, which is important for product trust and monetization.

## Strength 4: Manual override awareness
The optimizer respects user control.

This is extremely important for safety and user confidence.

## Strength 5: Real Meta instrumentation
The backend logs Meta usage in a way that supports debugging and platform-review needs.

---

# 8. Biggest backend fragilities right now

## Fragility 1: Overloaded `auth.js`
Too many unrelated responsibilities are concentrated in one file.

## Fragility 2: LowDB as primary state store
This is workable for MVP, but:
- concurrency is limited
- schema drift is easy
- scale durability is limited

## Fragility 3: Identity reconciliation complexity
User/session/billing/token ownership is flexible, which is useful, but can create subtle drift bugs.

## Fragility 4: Filesystem-based generated asset handling
Good for MVP, but fragile across deployments and persistence environments.

## Fragility 5: Optimizer mutation risk
Action logic can accidentally become too aggressive if thresholds, plan limits, or pending-test guards are weakened.

## Fragility 6: Duplicated/transitional logic
There are signs of copied or iterative modules. Claude should verify imports before editing.

---

# 9. What Claude should assume before making edits

Claude should assume the backend has these non-negotiable constraints:

1. **Do not break onboarding survivability**
   - session-first flows may be intentional

2. **Do not break Stripe-to-user binding**
   - paying users must not lose access

3. **Do not break ownerKey logic**
   - token/campaign ownership depends on it

4. **Do not weaken manual override protections**
   - user control must be respected

5. **Do not make optimizer actions more aggressive without strong justification**
   - Smartemark should act like a measured marketer, not a mutation spammer

6. **Do not broadly refactor route structure in one shot**
   - too much MVP behavior is likely encoded in current flow order

---

# 10. Recommended editing priorities for Claude

## Safe high-value areas
These are good places for careful improvement:
- optimizer diagnosis quality
- optimizer decision quality
- optimizer public summary clarity
- optimizer copy logic
- prompt/context quality for creative generation
- validation and normalization around optimizer state writes

## Medium-risk areas
- scheduler eligibility logic
- Stripe identity cleanup
- Meta insight normalization improvements

## High-risk areas
- session/SID/cookie logic
- ownerKey generation logic
- auth route broad refactors
- action mutation execution
- generated media URL behavior
- webhook or middleware ordering in server boot

---

# 11. Likely future refactor direction (not for immediate rewrite)

This is the cleaner long-term architecture Smartemark appears to want:

## A. Identity/billing split
Break out:
- auth/session routes
- Facebook connection routes
- billing routes
- debug/admin routes

## B. Optimizer domain package
Keep optimizer modules together under a clear domain boundary:
- state
- sync
- diagnose
- decide
- act
- monitor
- summarize
- schedule

## C. Better persistent storage
Eventually migrate optimizer/user/billing state out of LowDB into a proper database.

## D. Explicit typed schemas
Use stricter state validators or schemas so campaign state shape cannot drift silently.

But again: **that is future cleanup, not the immediate mission**.

---

# 12. Immediate backend mission for Smartemark

Based on the current architecture, the immediate backend mission is:

1. stabilize account/session/billing ownership
2. keep onboarding and Meta connection reliable
3. keep campaign launch flow reliable
4. strengthen optimizer reasoning quality
5. strengthen guardrails around actions and creative testing
6. preserve explainability in public summaries
7. avoid broad refactors that risk working behavior

---

# 13. Final instruction block for Claude Code

When working in this backend, Claude should follow these rules:

## Read first
- Read this file first
- Then inspect imports/usages before editing any module

## Preserve behavior
- Preserve current working onboarding/session/billing behavior unless fixing a known bug
- Preserve ownerKey-based resource ownership
- Preserve manual override blocking
- Preserve plan-based limits

## Edit style
- Prefer the smallest safe fix
- Trace full flow before editing
- Do not broadly refactor because a file “looks messy”
- Confirm whether a file is actually imported before changing it

## Optimizer philosophy
- Smartemark should behave like a measured marketer
- One strong move is better than five random moves
- Waiting is often better than premature mutation
- The optimizer should become smarter, not noisier

## Product philosophy
- This backend is trying to become an autonomous operator, not just a CRUD API
- Diagnosis, decision, action, and monitoring should remain separate layers
- Public summaries should explain behavior without exposing raw internal complexity

---

# 14. Bottom line

The backend is a **hybrid system**:

- part SaaS auth/billing backend
- part Meta ads operations backend
- part creative-generation backend
- part stateful autonomous optimizer runtime

The real strategic core is the optimizer architecture plus the identity/billing/Meta ownership glue that makes it usable in production.

Claude should treat the backend as a **working but fragile operator system**:
improve it carefully, preserve intent, and avoid broad rewrites unless explicitly requested.
