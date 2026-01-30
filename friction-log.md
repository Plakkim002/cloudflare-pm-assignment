# Cloudflare Product Insights - Friction Log

## 1. Node.js Version Requirement Too Strict
**Problem:** Setup failed because Node v18.14.0 didn't meet the >=18.14.1 requirement - a 0.0.1 difference. Error message was buried in stack trace with unclear "EBADENGINE" warnings. No guidance on how to fix (install nvm, update Node, etc.)

**Suggestion:** 
- Show clear error at top: "⚠️ Node.js 18.14.1+ required. You have v18.14.0"
- Include fix instructions: "Run: nvm install 20" or link to nodejs.org
- Consider relaxing version requirement - 18.14.0 should work fine
- Pre-flight version check before installation starts

**Impact:** Lost 5+ minutes troubleshooting, had to install nvm from scratch

---

## 2. Template Selection - Unclear Purpose
**Problem:** Presented with 9 template options but no clear explanation of what each does or when to use them. "API starter (OpenAPI compliant)" sounds relevant but unclear if it's better than "Worker only" for my use case.

**Suggestion:**
- Add 1-line description under each option: "Worker only - Start from scratch, add products later"
- Include a "Not sure? Start here →" pointer to recommended option
- Link to template comparison guide in docs

---

## 3. D1 Setup - Local vs Remote Confusion
**Problem:** Had to run schema and seed commands twice (--local and --remote). Not immediately clear why both are needed or what the difference is. Documentation doesn't explain this upfront.

**Suggestion:**
- Add flag: `--both` to apply to local AND remote in one command
- Or: Prompt "Apply to local and remote? (Y/n)" 
- Explain in setup docs: "Local = testing, Remote = production"

## 4. D1 Execute - No Visual Confirmation
**Problem:** After running execute commands, there's minimal feedback. No "X rows created" or "Schema applied successfully" message. Had to manually query to verify.

**Suggestion:**
- Show confirmation: "✅ Created table 'feedback' with 0 rows"
- After INSERT: "✅ Inserted 15 rows into 'feedback'"
- Add `--verbose` flag for detailed output

## 5. Remote AI Binding Requires workers.dev Setup
**Problem:** Dev server failed because AI binding defaulted to remote mode, which requires workers.dev subdomain registration. Error message appeared mid-startup, not during initial setup. Unclear why AI needs remote when D1 works locally.

**Suggestion:**
- Default AI to local mode for dev (like D1 does)
- Or: Check for workers.dev subdomain during `npm create cloudflare` and prompt setup then
- Better error message: "Press 'l' for local mode or register workers.dev subdomain"


