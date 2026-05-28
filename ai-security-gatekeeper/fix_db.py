from backend.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    conn.execute(text("UPDATE scan_results SET status = 'BLOCKED' WHERE status = 'OVERRIDDEN'"))
    conn.commit()

print('Reset done — all OVERRIDDEN scans set back to BLOCKED')