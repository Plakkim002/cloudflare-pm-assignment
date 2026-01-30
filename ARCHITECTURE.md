# Architecture Overview - Feedback Signal Detector

## Cloudflare Products Used

### 1. **Workers** (Core Orchestration)
- **Why:** Serverless compute to run the anomaly detection logic
- **How:** Handles HTTP requests, executes severity scoring algorithm, serves dashboard
- **Routes implemented:**
  - `/` - Interactive dashboard
  - `/analyze` - Core severity analysis endpoint
  - `/feedback` - View all feedback data
  - `/risks` - Get top 3 critical alerts

### 2. **D1 Database** (Data Storage)
- **Why:** Serverless SQL database to store and query feedback data
- **How:** Two tables:
  - `feedback` - Stores customer complaints with source, category, user_type
  - `severity_scores` - Stores calculated risk metrics (prepared for time-series analysis)
- **Binding:** `DB` in wrangler.jsonc

### 3. **Workers AI** (Sentiment Analysis)
- **Why:** Enhance severity scoring with AI-powered sentiment detection
- **How:** Uses Llama 3.1 model to analyze complaint sentiment (critical/negative/neutral)
- **Impact:** Increases severity score by 1.3x for "critical" sentiment
- **Binding:** `AI` in wrangler.jsonc

## Severity Scoring Algorithm

The core innovation is the **multi-factor severity score** that prioritizes feedback by business impact:
```
Base Score = complaint_count × 10

Multipliers:
- User Type: enterprise = 2.5x, developer = 1x
- Category: performance/reliability/billing = 1.5x
- Sentiment: critical (via AI) = 1.3x

Final Score = Base Score × User Type × Category × Sentiment
```

**Example:**
- 3 performance complaints from enterprise users with critical sentiment:
  - Base: 3 × 10 = 30
  - Enterprise: 30 × 2.5 = 75
  - Performance: 75 × 1.5 = 112.5
  - Critical sentiment: 112.5 × 1.3 = **146** (highest priority)

## Why This Helps Cloudflare PMs

**Problem Solved:** PMs receive scattered feedback from multiple sources without clear prioritization.

**Solution:** This tool automatically:
1. Aggregates feedback by category and user segment
2. Calculates business-impact-weighted severity scores
3. Surfaces top 3-5 risks requiring immediate attention
4. Provides sample complaints for context

**Key Insight:** Volume ≠ Urgency. 10 developer complaints about docs < 2 enterprise complaints about billing.

## Deployment

- **Local Development:** `npm run dev` (uses local D1, remote AI)
- **Production:** `npx wrangler deploy`
- **Live URL:** https://cloudflarepm.praneeth-lakkim.workers.dev

## Future Enhancements

- **Workflows:** Automated Slack alerts when severity threshold breached
- **Time-series analysis:** Detect velocity of complaint spikes (3x increase in 6 hours = emergency)
- **AI Search:** Semantic clustering of similar complaints across different wording
