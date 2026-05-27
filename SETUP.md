# AI Security Gatekeeper — Phase 1 Setup

## Prerequisites

- Python 3.11+
- Docker and Docker Compose

## 1. Environment variables

Copy the example env file and adjust if needed:

```bash
cp .env.example .env
```

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (default matches `docker-compose.yml`) |
| `GROQ_API_KEY` | Required for Phase 2 AI scan analysis (Groq / Llama 3) |

## 2. Start PostgreSQL

From the project root:

```bash
docker compose up -d
```

Verify the database is healthy:

```bash
docker compose ps
```

## 3. Install Python dependencies

```bash
python -m venv .venv
```

**Windows (PowerShell):**

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**macOS / Linux:**

```bash
source .venv/bin/activate
pip install -r requirements.txt
```

## 4. Run the API server

From the project root (with the virtual environment activated):

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

## 5. Quick API test

**Submit a scan (OSV + Groq analysis):**

```bash
curl -X POST http://localhost:8000/api/scan/ \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"lodash\", \"version\": \"4.17.21\", \"ecosystem\": \"npm\"}"
```

**List scan history:**

```bash
curl http://localhost:8000/api/history/
```

## 6. Connect the React frontend

The API allows CORS from `http://localhost:5173` (Vite default). Point your frontend at `http://localhost:8000`.

## Stop services

```bash
docker compose down
```

To remove persisted database data:

```bash
docker compose down -v
```
