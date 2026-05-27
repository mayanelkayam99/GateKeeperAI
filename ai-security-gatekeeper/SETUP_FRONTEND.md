# AI Security Gatekeeper — Frontend Setup

## Prerequisites

- Node.js 18+ and npm
- Backend API running at `http://localhost:8000` (see root `SETUP.md`)

## 1. Install dependencies

From the project root:

```bash
cd frontend
npm install
```

## 2. Start the development server

```bash
npm run dev
```

The dashboard opens at **http://localhost:5173** (Vite default).

## 3. Verify integration

1. Start PostgreSQL: `docker compose up -d` (from project root)
2. Start the API: `uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000`
3. Ensure `.env` includes a valid `GROQ_API_KEY`
4. Open the frontend and run a scan (e.g. `lodash` @ `4.17.20`, ecosystem `npm`)

The UI calls:

- `POST http://localhost:8000/api/scan/` — submit scans
- `GET http://localhost:8000/api/history/` — load history on page load

CORS is already configured on the backend for `localhost:5173`.

## 4. Production build (optional)

```bash
npm run build
npm run preview
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Network error on scan | Confirm the FastAPI server is running on port 8000 |
| CORS error | Use `http://localhost:5173`, not a different port |
| Scan hangs | Groq/OSV analysis can take up to ~60s; wait for the loading state |
| Empty history | Run at least one successful scan |
