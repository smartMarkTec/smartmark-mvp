# SMARTEMARK_FULL_CONTEXT.md

## Purpose of this document

This file gives Claude Code a founder-level understanding of what Smartemark is, what it currently does, what it is becoming, and how the product should think.

This is not just a technical note. It is the strategic operating context Claude should keep in mind while working inside the repo.

---

# 1. What Smartemark is

Smartemark is an AI-assisted Meta ads SaaS for local businesses.

Current practical user experience:
- business owner enters a few simple inputs
- Smartemark generates ad creatives and copy
- user connects their Facebook ad account
- user sets launch details
- Smartemark launches the campaign
- Smartemark shows campaign status and performance
- Smartemark begins moving toward automated optimization

Current practical value proposition:
- easier than Meta Ads Manager
- simpler and cheaper than hiring an agency
- faster to launch than doing ads manually
- usable by business owners who are not marketers

The current product is already useful as a launch + simplify + assist product.

---

# 2. What Smartemark is becoming

The long-term goal is not just AI ad generation.

The long-term goal is an autonomous marketer.

Smartemark should evolve from:
“I help you generate creatives and launch ads.”

to:
“I observe campaign performance, diagnose issues, decide the next best move, act carefully, monitor the result, and repeat like a measured marketer.”

The eventual product should feel less like a tool and more like an operator.

---

# 3. Core product philosophy

Smartemark should behave like a marketer with judgment.

Not:
- random automation
- spammy mutation
- generic AI advice
- a dashboard that only gives tips

Instead:
- calm operator
- metric-aware
- explainable
- strategic
- measured
- tier-aware
- respectful of user constraints

The internal loop should be:

**Observe → Diagnose → Decide → Act → Monitor → Repeat**

That loop is the heart of the product.

---

# 4. What the product currently does

## A. Account and access flow
- signup
- login
- session continuity
- Stripe plan selection / billing
- billing-aware access

## B. Website / acquisition flow
- landing page
- pricing page
- public-facing positioning
- privacy page

## C. Business input + creative flow
- user enters business details
- user generates ad creatives/copy
- creatives persist across refreshes and redirects
- setup state can survive Facebook OAuth and other transitions

## D. Facebook / campaign setup flow
- user connects Facebook assets
- user reaches setup/control page
- campaign launch is prepared with restored creatives and preview state

## E. Campaign control and optimizer flow
- campaign state can be loaded
- metrics can be synced
- diagnosis, decision, action, monitoring, and public summary layers exist
- scheduler and autorun infrastructure exist
- the product is already moving toward automated campaign management

---

# 5. What matters now vs later

## What matters now
1. stable signup/login/session continuity
2. stable Stripe/account binding
3. stable Facebook connect + setup flow
4. stable FormPage → CampaignSetup creative transfer
5. reliable campaign launch behavior
6. reliable optimizer state and measured post-launch behavior
7. clear user-facing explanation of what Smartemark is doing

## What matters later
- deeper conversion tracking
- more advanced GTM/event tracking
- richer landing-page or funnel diagnosis
- larger ad-channel expansion
- broader multi-platform marketing automation
- more advanced multi-campaign account management
- stronger reporting and analytics depth

Immediate mission is not maximum feature breadth. It is stability + agent quality.

---

# 6. The autonomous marketer vision

Smartemark’s final vision is a system that can function as a real marketer inside explicit guardrails.

The autonomous marketer should be able to:
- inspect campaign metrics
- recognize whether there is enough signal
- identify the likely bottleneck
- choose the highest-leverage next move
- avoid acting too early
- avoid opening too many simultaneous tests
- respect plan limits and user control
- explain what it is doing in product language
- keep learning from campaign state over time

It should not feel like:
- a random content generator
- a fake AI manager that only talks
- an overreactive script that changes ads constantly

It should feel like a measured marketing operator.

---

# 7. The marketer loop in plain English

## Observe
Read:
- campaign status
- delivery state
- impressions
- clicks
- spend
- CTR
- CPC
- frequency
- conversions
- conversion rate
- creative context
- recent actions
- current test state

## Diagnose
Determine what is actually wrong or what state the campaign is in.

Examples:
- billing blocked
- scheduled but not started
- no delivery
- insufficient data
- weak engagement
- low CTR
- post-click conversion gap
- creative fatigue risk
- healthy early signal

## Decide
Choose the best next move.

Examples:
- continue monitoring
- restore delivery
- refresh copy
- prepare fresh creative variant
- promote generated challenger creatives
- pause losing challenger
- keep control
- wait for more signal

## Act
Perform one careful action.

Examples:
- unpause campaign
- update primary text
- generate new creative variants
- promote challenger creatives
- pause losing variants

## Monitor
See whether:
- the action worked
- the test is still gathering signal
- there is enough signal for a winner/loser decision
- the campaign should be left alone

This loop is the strategic center of Smartemark.

---

# 8. Tier philosophy

Smartemark should have increasing levels of marketer capability.

## Standard / Starter
Should give:
- easy campaign launch
- AI-generated creatives/copy
- basic campaign monitoring
- measured optimization
- simpler A/B testing behavior
- fewer simultaneous variants
- fewer connected businesses/accounts
- enough intelligence to perform decently without complexity

This tier should feel like:
“I want Smartemark to make ads manageable and do the essentials well.”

## Pro
Should give:
- more campaign capacity
- more businesses/accounts
- more creative variations
- stronger optimization logic
- more active testing behavior
- deeper strategy than basic usage
- stronger AI reasoning and refresh cadence

This tier should feel like:
“I want stronger performance management and more serious AI help.”

## Operator
Should be the most autonomous and strategically powerful version.

It should eventually include:
- the deepest optimizer reasoning
- strongest diagnosis quality
- most sophisticated decision quality
- highest safe creative-test capacity
- best understanding of campaign state
- most operator-like behavior
- highest priority support
- the closest thing to an in-product autonomous marketer

This tier should feel like:
“I want Smartemark acting as my operator, not just my helper.”

---

# 9. Non-negotiable behavior rules

1. Do not mutate too aggressively
2. Do not open endless creative rounds
3. Do not act without signal
4. Do not ignore user control
5. Do not break billing/access continuity
6. Do not break onboarding continuity
7. Do not confuse the user
8. Do not collapse diagnosis and decision into one vague blob

---

# 10. What Claude should understand about the codebase

Smartemark is not just:
- a landing page
- a Stripe app
- a CRUD campaign tool
- a creative generator

It is a hybrid of:
- SaaS auth/billing system
- marketing onboarding flow
- creative-generation system
- Meta ads integration layer
- stateful optimizer runtime
- emerging autonomous marketer

Because of that, the codebase contains both:
- normal app logic
- operator-style campaign logic

Both matter.

---

# 11. What Claude should prioritize when editing

## Highest priorities
- preserve working auth/session/billing continuity
- preserve FormPage → CampaignSetup continuity
- preserve Facebook connection continuity
- preserve optimizer state integrity
- improve diagnosis / decision / action quality
- improve agent guardrails
- improve explainability of public summaries

## Medium priorities
- reduce duplication
- improve code organization gradually
- improve helper clarity
- improve error messaging
- improve tier wiring consistency

## Lower priorities for now
- broad visual redesigns
- deep analytics rebuild
- GTM-first refactors
- speculative multi-channel expansion
- big-bang rewrites

---

# 12. How Smartemark should think

### Example 1: low early data
There is not enough trustworthy signal yet. Continue monitoring.

### Example 2: weak CTR after meaningful impressions
The creative hook or messaging is weak. Start with one high-leverage refresh, not many random changes.

### Example 3: clicks exist but conversions lag badly
The problem may be post-click, offer, or traffic quality. Do not keep only changing the image if the deeper issue is after the click.

### Example 4: frequency elevated and response softening
There may be creative fatigue. Prepare a measured challenger test.

### Example 5: delivery blocked
Restore delivery before attempting creative or copy optimization.

This is the mindset Smartemark should keep maturing into.

---

# 13. Product positioning in one sentence

Smartemark is an AI-powered Meta ads platform that starts by making ad launch simple and is evolving into a measured autonomous marketer for local businesses.

---

# 14. Immediate product mission

- stabilize the current product
- make onboarding and setup reliable
- make billing/account binding reliable
- keep campaign launch reliable
- strengthen the optimizer brain
- enforce guardrails around action quality
- move toward real operator behavior without breaking working flows

---

# 15. Final instruction block for Claude Code

When working in Smartemark, Claude should:

## Read first
- read this file first
- then read backend and frontend architecture notes

## Preserve
- onboarding continuity
- billing/access continuity
- Facebook/session continuity
- optimizer state shape
- diagnosis → decision → action → monitoring separation
- plan/tier constraints

## Edit style
- smallest safe change first
- preserve working behavior unless fixing a known bug
- trace the full flow before editing
- do not “clean up” logic that may be protecting real state continuity

## Strategic orientation
- optimize toward an autonomous marketer
- keep the system measured, explainable, and tier-aware
- avoid turning Smartemark into a noisy mutation engine
- avoid turning Smartemark into a passive dashboard

---

# 16. Bottom line

Smartemark already has real practical value as an easier, faster way to generate creatives, launch Meta campaigns, and guide campaign management.

But its real long-term value is larger:

It is becoming a full autonomous marketer, with different levels of operator capability depending on plan tier.

Everything in the codebase should move in that direction:
not chaotic automation, not generic AI help, but a calm, strategic, measurable operator.
