from backend.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    conn.execute(text("ALTER TABLE scan_results ADD COLUMN IF NOT EXISTS developer_name VARCHAR(128) NOT NULL DEFAULT 'unknown'"))
    conn.commit()

print('Done')