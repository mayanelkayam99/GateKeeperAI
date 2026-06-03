from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.database import Base, engine
from backend.models import Package, ScanResult, CompanyPolicy
from backend.routers import history, scan, webhook, policy, chat  # ← chat נוסף כאן לשורת ה-imports
from backend.routers import history, scan, webhook, policy, chat, override
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="AI Security Gatekeeper",
    description="AppSec platform for open-source dependency analysis",
    version="0.1.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

import os

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]

env_origins = os.getenv("ALLOWED_ORIGINS")
if env_origins:
    origins.extend([o.strip() for o in env_origins.split(",")])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex="https://.*\\.vercel\\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(policy.router)
app.include_router(scan.router)
app.include_router(history.router)
app.include_router(webhook.router)
app.include_router(chat.router)   # ← נוסף בסוף, אחרי שapp מוגדר
app.include_router(override.router)

@app.get("/health")
def health_check():
    return {"status": "ok"}


