# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AI Security Gatekeeper** is a full-stack security analysis platform for open-source dependencies. It combines the OSV vulnerability database with Groq's Llama 3.3 70B LLM to provide intelligent, policy-driven security decisions (APPROVED / WARNING / BLOCKED). It integrates with GitHub webhooks and git pre-push hooks.

## Repository Layout

The actual project lives in the `ai-security-gatekeeper/` subdirectory:
```
ai-security-gatekeeper/
├── backend/           # FastAPI app
│   ├── agents/        # LLM orchestration (Groq/Langchain)
│   ├── routers/       # scan.py, history.py, webhook.py
│   ├── services/      # osv.py (OSV API), npm.py (npm registry)
│   └── tests/
└── frontend/          # React + Vite + Tailwind
    └── src/
        ├── api/       # Axios client (localhost:8000)
        ├── components/
        └── utils/
```

## Common Commands

All commands run from `ai-security-gatekeeper/` unless noted.

### Backend

```bash
# Start database
docker compose up -d

# Set up and activate virtualenv (first time)
python -m venv .venv
source .venv/Scripts/activate   # Windows bash
# source .venv/bin/activate     # Linux/macOS

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
npm run build    # production build to dist/
npm run preview  # preview production build
```

### Tests

```bash
# From ai-security-gatekeeper/
python -m pytest backend/tests/
python -m pytest backend/tests/test_npm_service.py  # single file
```

### Git Pre-Push Hook

```bash
python create_hook.py   # generates .git/hooks/pre-push script
```

## Architecture

### Request Flow

```
Frontend ScanForm → POST /api/scan/
  → OSV API (vulnerability lookup)
  → npm Registry (license info)
  → SecurityOrchestrator (Groq Llama 3.3 70B)
  → ScanResult persisted to PostgreSQL
  → Response: {status, cve_summary, license_type, ai_explanation}
```

### Key Components

**`backend/agents/orchestrator.py`** — Core AI engine. Sends package metadata + OSV results to Groq. Returns one of four statuses:
- `BLOCKED` — CRITICAL_EXECUTION, DATA_INTEGRITY, COMPLIANCE violations, or CVSS ≥ 7.0
- `WARNING` — OPERATIONAL risk or LLM fallback
- `APPROVED` — No significant findings

**`backend/routers/scan.py`** — Two endpoints:
- `POST /api/scan/` — single package scan
- `POST /api/scan/pre-push/` — batch scan of top 10 deps from package.json (used by git hook)

**`backend/routers/webhook.py`** — GitHub webhook handler; fetches package.json at commit SHA, scans top 3 deps, posts commit status back to GitHub as a background task.

**`backend/services/osv.py`** — LRU-cached OSV API queries. Normalizes ecosystem names and extracts CVE IDs, summaries, CVSS scores.

**`frontend/src/utils/statusTheme.js`** — Maps scan status to visual styling (gradients, colors, glows).

### Environment Variables

Required in `ai-security-gatekeeper/.env`:
```
DATABASE_URL=postgresql://gatekeeper:gatekeeper_secret@localhost:5432/gatekeeper
GROQ_API_KEY=<your_groq_api_key>
```

### Database

PostgreSQL via Docker. Two models (`backend/models.py`):
- `Package` — name, version, ecosystem
- `ScanResult` — FK to Package, status enum, cve_summary, license_type, ai_explanation, timestamp

Tables are created automatically on backend startup via SQLAlchemy `Base.metadata.create_all`.
