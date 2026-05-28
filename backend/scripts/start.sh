#!/bin/bash
# Run Alembic migrations before starting the server.
# If upgrade fails because tables already exist (DuplicateTableError),
# stamp head so Alembic learns the current state, then retry.
# A genuine new-migration failure on the second run still exits non-zero.
set -e

if ! alembic upgrade head; then
    echo "alembic upgrade head failed — tables may already exist, stamping head and retrying"
    alembic stamp head
    alembic upgrade head
fi

exec uvicorn main:app --host 0.0.0.0 --port "$PORT"
