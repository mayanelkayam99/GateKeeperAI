# backend/routers/chat.py

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from groq import Groq
import os, json

from backend.database import get_db
from backend.models import ScanResult, Package

router = APIRouter(prefix="/api/chat", tags=["chat"])

class ChatRequest(BaseModel):
    scan_id: int
    message: str
    history: list[dict] = []   # [{"role": "user"|"assistant", "content": "..."}]


def _build_system_prompt(pkg: Package, scan: ScanResult) -> str:
    # Split the joined ai_explanation+recommendation column
    parts = (scan.ai_explanation or "").split("===RECOMMENDATION===")
    explanation  = parts[0].strip() if len(parts) > 0 else "N/A"
    recommendation = parts[1].strip() if len(parts) > 1 else "N/A"

    return f"""You are the Remediation Co-Pilot — an expert DevSecOps assistant embedded
inside the AI Security Gatekeeper dashboard.

A developer's git push was BLOCKED because of the following package:

PACKAGE CONTEXT
---------------
Name:        {pkg.name}
Version:     {pkg.version}
Ecosystem:   {pkg.ecosystem}
Status:      {scan.status}
License:     {scan.license_type or "Unknown"}
CVSS Score:  {scan.cvss_max_score or "N/A"}
CVE Summary: {scan.cve_summary or "None found"}

AI RISK EXPLANATION
-------------------
{explanation}

RECOMMENDED REMEDIATION
------------------------
{recommendation}

RULES
-----
1. Answer the developer's question fully and accurately using the package context
   provided above. You have full knowledge of this specific package's vulnerabilities
   and license issues — use it to give precise, helpful answers.
2. Only answer questions about THIS specific package, its vulnerabilities, license
   issues, or migration path. Politely decline anything off-topic.
3. When recommending alternatives, verify they are not themselves blocked packages.
   Never suggest a package that has known critical CVEs or license violations.
4. Always provide exact terminal commands in ```bash blocks.
5. Always show before/after code diffs in ```javascript (or relevant language) blocks.
6. Flag breaking changes clearly only when asked about migration.
7. Be concise and developer-focused. One question = one focused answer."""

@router.post("/")
async def chat(req: ChatRequest, db: Session = Depends(get_db)):
    # 1. Load scan + package from DB
    scan = db.query(ScanResult).filter(ScanResult.id == req.scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    pkg = db.query(Package).filter(Package.id == scan.package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")

    # 2. Build message list for Groq
    system_prompt = _build_system_prompt(pkg, scan)
    messages = [
        *req.history,                          # prior turns
        {"role": "user", "content": req.message}
    ]

    # 3. Stream from Groq
    client = Groq(api_key=os.environ["GROQ_API_KEY"])

    def event_stream():
        with client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "system", "content": system_prompt}, *messages],
            max_tokens=1024,
            temperature=0.3,
            stream=True,
        ) as stream:
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield f"data: {json.dumps({'token': delta})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")