# Cloudflare Product Manager Intern Assignment
**Candidate:** Praneeth Kumar  
**Submission Date:** January 30, 2026

---

## Project Links

**Live Demo:** https://cloudflarepm.praneeth-lakkim.workers.dev

**GitHub Repository:** https://github.com/Plakkim002/cloudflare-pm-assignment

---

## Project Overview: Feedback Signal Detector

An AI-powered early warning system that helps PMs prioritize product feedback by **business impact**, not just volume.

**Core Innovation:** Multi-factor severity scoring algorithm that weighs:
- User segment (enterprise vs developer)
- Category criticality (performance/billing vs documentation)
- AI-detected sentiment
- Complaint velocity (prepared for time-series)

**Key Insight:** 2 enterprise billing complaints are more urgent than 10 developer documentation requests.

---

## Architecture

### Cloudflare Products Used

**1. Workers** (Core Orchestration)
- Serverless compute running severity analysis logic
- Routes: `/` (dashboard), `/analyze`, `/feedback`, `/risks`
- Handles HTTP requests and serves interactive UI

**2. D1 Database** (Data Storage)
- Serverless SQL database storing feedback and severity scores
- Tables: `feedback` (complaints), `severity_scores` (metrics)
- Binding: `DB`

**3. Workers AI** (Sentiment Analysis)
- Llama 3.1 model for sentiment detection
- Enhances scoring: critical sentiment = 1.3x multiplier
- Binding: `AI`

### Severity Scoring Algorithm
```
Base Score = complaint_count × 10

Multipliers:
- Enterprise users: 2.5x
- Critical categories (performance/billing/reliability): 1.5x
- AI-detected critical sentiment: 1.3x

Example: 3 enterprise performance complaints with critical sentiment
→ 3×10 × 2.5 × 1.5 × 1.3 = 146 severity score
```

### Bindings Screenshot
*(See wrangler.jsonc configuration below)*
```json
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "feedback-db",
      "database_id": "bc3ead67-4edf-4b8c-aa1d-bf4435966102"
    }
  ],
  "ai": {
    "binding": "AI"
  }
}
```

---

## Cloudflare Product Insights - Friction Log

### 1. Node.js Version Requirement Too Strict
**Problem:** Setup failed with Node v18.14.0 vs required v18.14.1 (0.0.1 difference). Error buried in stack trace with "EBADENGINE" warnings. No clear resolution steps provided.

**Suggestion:**
- Display clear error at top: "⚠️ Node.js 18.14.1+ required. You have v18.14.0"
- Include fix instructions: "Run: nvm install 20" or link to nodejs.org
- Consider relaxing version constraint - 18.14.0 should work fine
- Add pre-flight version check before package installation begins

**Impact:** Lost 5+ minutes troubleshooting, had to install nvm from scratch

---

### 2. Template Selection Lacks Context
**Problem:** Presented with 9 template options without descriptions of what each does or when to use them. "API starter (OpenAPI compliant)" sounded relevant but unclear if better than "Worker only" for feedback aggregation use case.

**Suggestion:**
- Add 1-line description under each option: "Worker only - Start from scratch, add products via bindings later"
- Include "Not sure? Start here →" pointer to recommended option for beginners
- Link to template comparison guide in documentation

---

### 3. D1 Local vs Remote Workflow Unclear
**Problem:** Had to execute schema and seed commands twice (--local and --remote). Not immediately clear why both needed or what the difference is. Documentation doesn't explain this distinction upfront.

**Suggestion:**
- Add `--both` flag to apply schema/seed to local AND remote in one command
- Or prompt: "Apply to local and remote? (Y/n)" after execution
- Explain in setup docs: "Local = dev/testing, Remote = production"
- Show which environment is active in CLI output

---

### 4. D1 Execute Lacks Confirmation Feedback
**Problem:** After running execute commands, minimal visual feedback. No "X rows created" or "Schema applied successfully" message. Had to manually query database to verify operations worked.

**Suggestion:**
- Show confirmation: "✅ Created table 'feedback' with 0 rows"
- After INSERT: "✅ Inserted 15 rows into 'feedback'"
- Add `--verbose` flag for detailed operation output
- Display table structure after CREATE TABLE

---

### 5. AI Binding Remote-Only Causes Dev Friction
**Problem:** Dev server failed on startup because AI binding defaulted to remote mode, which requires workers.dev subdomain registration. Error appeared mid-startup, not during initial project setup. Unclear why AI needs remote when D1 works locally.

**Suggestion:**
- Default AI binding to local mode for development (consistent with D1 behavior)
- Check for workers.dev subdomain during `npm create cloudflare` and prompt setup then
- Improve error message: "AI requires remote mode. Press 'l' for local or register workers.dev subdomain"
- Document which products work locally vs require remote

**Impact:** Broke dev flow - had to stop, register subdomain, restart server

---

### 6. Wrangler Config Format Inconsistency
**Problem:** Generated project used `wrangler.jsonc` but most documentation examples show `wrangler.toml`. Initially tried adding bindings in TOML format before realizing file was JSON. No clear migration guide between formats.

**Suggestion:**
- Make CLI ask: "Prefer wrangler.toml or wrangler.jsonc?" during setup
- Add format indicator to docs code blocks: "For wrangler.toml users" vs "For wrangler.jsonc users"
- Include conversion tool: `wrangler config convert --to toml`
- Highlight which format is recommended for new projects

---

## Vibe-Coding Context

**Platform Used:** Manual coding (no AI coding assistant)

**Key Development Steps:**
1. Initial project setup via `npm create cloudflare@latest`
2. D1 schema design focusing on feedback categorization and severity tracking
3. Severity scoring algorithm - iterated on multiplier values (enterprise 2.5x vs 2x based on typical B2B impact)
4. Workers AI integration for sentiment boost (1.3x seemed optimal without over-weighting AI uncertainty)
5. Dashboard HTML with simple, functional UI prioritizing clarity over aesthetics

**Time Breakdown:**
- Setup & familiarization: 45 minutes (including troubleshooting Node version)
- Core logic development: 1 hour 15 minutes
- Testing & deployment: 20 minutes
- Documentation: 40 minutes

**Total:** ~3 hours

---

## Why This Helps Cloudflare

**Problem:** PMs drown in scattered feedback from support tickets, GitHub, Discord, Twitter. Hard to extract themes, urgency, and business impact.

**Solution:** Automated triage system that:
1. Aggregates feedback by category and user segment
2. Calculates business-impact-weighted severity scores
3. Surfaces top 3-5 risks requiring immediate PM attention
4. Provides context via sample complaints

**Key Differentiator:** Treats feedback prioritization like credit risk modeling - not all signals are equal. Volume is noisy; impact matters.

**Future Extensions:**
- **Workflows:** Auto-Slack alerts when severity > threshold
- **Velocity detection:** 3x spike in complaints over 6 hours = emergency
- **AI Search:** Semantic clustering of similar issues across different wording
- **Historical patterns:** "Last time we saw this pattern, it led to X% churn"


