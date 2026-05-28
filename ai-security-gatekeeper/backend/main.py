from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.database import Base, engine
# 1. הוספנו כאן את ה-import של policy
from backend.routers import history, scan, webhook, policy 
from backend.models import Package, ScanResult, CompanyPolicy

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="AI Security Gatekeeper",
    description="AppSec platform for open-source dependency analysis",
    version="0.1.0",
    lifespan=lifespan,
    redirect_slashes=False,  # 2. פותר את בעיית ה-400 Bad Request בבקשות OPTIONS בלי לוכסן בסוף
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",      # ← השורה החדשה
        "http://127.0.0.1:5174",      # ← השורה החדשה
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. הוספת הראוטר של הפוליסי לשרת
app.include_router(policy.router)

app.include_router(scan.router)
app.include_router(history.router)
app.include_router(webhook.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}