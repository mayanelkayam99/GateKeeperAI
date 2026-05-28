# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AI Security Gatekeeper** is a full-stack security analysis platform for open-source dependencies. It combines the OSV vulnerability database with Groq's Llama 3.3 70B LLM and a legal compliance agent to produce policy-driven security decisions (APPROVED / WARNING / BLOCKED). It integrates with GitHub webhooks and git pre-push hooks.

## Repository Layout

The actual project lives in the `ai-security-gatekeeper/` subdirectory:
```
ai-security-gatekeeper/
├── backend/
│   ├── agents/orchestrator.py    # Core AI engine (Groq + LangChain)
│   ├── routers/                  # scan.py, history.py, webhook.py
│   ├── services/
│   │   ├── legal_agent.py        # SPDX license compliance via Groq
│   │   ├── osv.py                # OSV vulnerability API (LRU-cached)
│   │   └── npm.py                # npm registry license lookup
│   ├── models.py                 # SQLAlchemy: Package, ScanResult
│   ├── schemas.py                # Pydantic schemas with model_validator
│   └── tests/
└── frontend/
    ├── main.jsx                  # BrowserRouter with / and /scan/:scanId routes
    └── src/
        ├── api/                  # client.js (axios), scan.ts (typed)
        ├── components/           # ScanForm, ScanResultCard, RemediationDashboard, HistoryTable, Header
        ├── types/api.ts          # TypeScript interfaces
        └── utils/statusTheme.js  # Status → visual style mapping
```

## Common Commands

All commands run from `ai-security-gatekeeper/` unless noted.

### Backend

```bash
# Start database
docker compose up -d

# Activate virtualenv (Windows bash)
source /c/ai-security-gatekeeper/.venv/Scripts/activate

pip install -r requirements.txt

# Run backend (hot reload)
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
npm run build
```

### Tests

```bash
# From ai-security-gatekeeper/
python -m pytest backend/tests/
python -m pytest backend/tests/test_legal_agent.py   # single file
```

### Git Pre-Push Hook

```bash
python create_hook.py   # generates .git/hooks/pre-push script
```

## Architecture

### Request Flow

```
Frontend ScanForm  →  POST /api/scan
  → npm Registry (license)
  → OSV API (CVE/CVSS)
  → SecurityOrchestrator (Groq Llama 3.3 70B)
      → returns {status, cve_summary, license_type, ai_explanation, recommendation}
  → LegalAgent (Groq) validates SPDX license
      → escalates to BLOCKED + sets recommendation if non-compliant
  → ScanResult persisted to PostgreSQL
  → Response: ScanResponse (includes recommendation field)

Frontend /scan/:scanId  →  GET /api/scan/{scan_id}
  → ScanResultResponse (model_validator splits stored ai_explanation into
    ai_explanation + recommendation before returning JSON)
```

### Analysis Dict — the internal currency

Every function in `scan.py` and `orchestrator.py` passes analysis as a `dict[str, str]` with exactly these keys:

| Key | Contains |
|-----|----------|
| `status` | `APPROVE` / `WARNING` / `BLOCKED` |
| `cve_summary` | Per-package CVE line items |
| `license_type` | SPDX identifier or `"Unknown"` / `"Mixed"` |
| `ai_explanation` | Risk prose only — no fix suggestions |
| `recommendation` | Actionable fix + named npm alternatives |

### DB Storage Pattern (Critical)

The `ScanResult` model has a single `ai_explanation` Text column. Both fields are stored together using a sentinel separator:

```
ai_explanation column = "{risk prose}\n\n===RECOMMENDATION===\n\n{fix text}"
```

Defined as `_RECOMMENDATION_SEP` in both `scan.py` and `schemas.py` (must stay in sync).

At **read time**, `ScanResultResponse` and `HistoryItemResponse` use a Pydantic `model_validator(mode="after")` to split on this separator and populate the virtual `recommendation` field. **Batch scans** (`license_type == "Mixed"`) skip the top-level split because they embed `===RECOMMENDATION===` within each per-package section of `ai_explanation`, separated by `\n\n---\n\n`.

### Key Components

**`backend/agents/orchestrator.py`** — LLM engine. Sends package + OSV data to Groq, parses JSON response with keys `status / cve_summary / license_type / ai_explanation / recommendation`. Applies enterprise policy overrides (CVSS ≥ 7.0 or RCE keywords → force BLOCKED). Falls back to WARNING on LLM errors.

**`backend/services/legal_agent.py`** — Second Groq call for SPDX compliance. Approved: MIT, Apache-2.0, BSD-*, ISC, Unlicense. Blocked: GPL, AGPL, LGPL, SSPL, Commons Clause, Unknown. Returns `{status, reason, risk_level, suggested_alternative}`. Called via `_apply_legal_check()` in `scan.py` after the orchestrator — if BLOCKED, overwrites `ai_explanation` with the legal reason and sets `recommendation` to the suggested npm alternative.

**`backend/routers/scan.py`** — Endpoints:
- `POST /api/scan` — single package (SimpleScanRequest: `package_name` only, defaults npm/*)
- `POST /api/scan/` — full scan (ScanRequest: name + version + ecosystem)
- `GET /api/scan/{scan_id}` — fetch stored result for Remediation Dashboard
- `POST /api/scan/pre-push/` — batch scan of top 10 deps from package.json payload

**`frontend/src/components/RemediationDashboard.jsx`** — Route `/scan/:scanId`. Parses batch vs single results from the stored `ai_explanation`. For batch scans, splits sections on `\n\n---\n\n`, then splits each section on `\n\n===RECOMMENDATION===\n\n` to extract per-package `explanation` and `recommendation`. Renders `DependencyCard` with separate "Why flagged" and "Recommended Fix" panels; the `parseRecommendation()` helper further splits `"Replace with X: pkg1, pkg2"` to render alternative packages as pill badges.

### Environment Variables

Required in `ai-security-gatekeeper/.env`:
```
DATABASE_URL=postgresql://gatekeeper:gatekeeper_secret@localhost:5432/gatekeeper
GROQ_API_KEY=<your_groq_api_key>
```

### Database

PostgreSQL via Docker. Two models (`backend/models.py`):
- `Package` — name, version, ecosystem
- `ScanResult` — FK to Package, status enum, cve_summary, cvss_max_score, license_type, ai_explanation (stores both explanation + recommendation via separator), scanned_at

Tables are created automatically on backend startup via `Base.metadata.create_all`.
