from backend.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    conn.execute(text("ALTER TABLE scan_results ALTER COLUMN status TYPE VARCHAR(32)"))
    conn.commit()

print('Column resized successfully')