# Smartemark Claude Instructions

Read these first before editing:
1. docs/SMARTEMARK_FULL_CONTEXT.md
2. docs/BACKEND_ARCHITECTURE_NOTES.md
3. docs/FRONTEND_ARCHITECTURE_NOTES.md

Rules:
- Preserve working behavior unless fixing a specific bug
- Do not broadly refactor
- Trace the full flow before editing
- Prefer the smallest safe fix first
- Preserve auth/session/billing continuity
- Preserve FormPage -> CampaignSetup continuity
- Preserve ownerKey / sid / storage namespace behavior
- Preserve optimizer state shape
- Smartemark should evolve toward a measured autonomous marketer, not noisy automation

Current priorities:
- stabilize auth/login/signup
- stabilize Stripe/account binding
- stabilize Facebook connect/setup flow
- improve optimizer diagnosis/decision/action/monitoring quality
- strengthen guardrails around creative testing and mutation frequency
- do not prioritize GTM/tracking yet