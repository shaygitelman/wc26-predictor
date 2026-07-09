#!/bin/bash
# Run Alembic migrations before starting the server.
# If the migration fails, the deploy must fail visibly — never silently
# stamp head to paper over a failed upgrade, since that can mark a migration
# as applied when its schema changes were never actually made.
set -e

echo "[start.sh] running alembic upgrade head..."
if ! alembic upgrade head; then
    echo "[start.sh] FATAL: alembic upgrade head failed — aborting deploy" >&2
    exit 1
fi
echo "[start.sh] alembic upgrade head succeeded"

exec uvicorn main:app --host 0.0.0.0 --port "$PORT"
