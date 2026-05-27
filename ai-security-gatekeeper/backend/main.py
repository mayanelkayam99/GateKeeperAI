from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.database import Base, engine
from backend.models import Package, ScanResult  # noqa: F401 — register models with metadata
from backend.routers import history, scan, webhook


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="AI Security Gatekeeper",
    description="AppSec platform for open-source dependency analysis",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scan.router)
app.include_router(history.router)
app.include_router(webhook.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
