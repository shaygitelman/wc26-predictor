"""
Internal cron endpoints — callable by the Vercel cron job with X-Cron-Secret.

These endpoints require CRON_SECRET (not ADMIN_KEY), so the frontend
cron route can call them using process.env.CRON_SECRET which is already
set in Vercel.  The backend reads CRON_SECRET from its own env var.
"""
from fastapi import APIRouter, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from core.config import settings
from core.database import get_db
from routers.admin import SyncResponse, _make_service

router = APIRouter(prefix="/cron", tags=["cron"])


def _verify_cron(x_cron_secret: str = Header(...)) -> None:
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid cron secret")


@router.post(
    "/sync-live",
    response_model=SyncResponse,
    dependencies=[Depends(_verify_cron)],
    summary="Cron-triggered live sync. Protected by X-Cron-Secret header.",
    include_in_schema=False,
)
async def cron_sync_live(db: AsyncSession = Depends(get_db)) -> SyncResponse:
    result = await _make_service().sync_live(db)
    return SyncResponse(**vars(result))


@router.post(
    "/reconcile-knockouts",
    response_model=SyncResponse,
    dependencies=[Depends(_verify_cron)],
    summary="Cron-triggered knockout slot reconciliation. Protected by X-Cron-Secret header.",
    include_in_schema=False,
)
async def cron_reconcile_knockouts(db: AsyncSession = Depends(get_db)) -> SyncResponse:
    result = await _make_service().reconcile_knockout_slots(db)
    return SyncResponse(**vars(result))


@router.post(
    "/update-r32-labels",
    dependencies=[Depends(_verify_cron)],
    summary="One-time: update R32 placeholder labels to match the real FIFA WC 2026 bracket.",
    include_in_schema=False,
)
async def cron_update_r32_labels(db: AsyncSession = Depends(get_db)) -> dict:
    from services.wc2026_seed import WC2026SeedService
    updated = await WC2026SeedService(db).update_r32_labels()
    return {"status": "ok", "updated": updated}


@router.post(
    "/fix-r16-dates",
    dependencies=[Depends(_verify_cron)],
    summary="One-time: fix R16 placeholder scheduled_at (corrects duplicate seed times).",
    include_in_schema=False,
)
async def cron_fix_r16_dates(db: AsyncSession = Depends(get_db)) -> dict:
    from services.wc2026_seed import WC2026SeedService
    updated = await WC2026SeedService(db).fix_r16_dates()
    return {"status": "ok", "updated": updated}


@router.post(
    "/fix-r32-dates",
    dependencies=[Depends(_verify_cron)],
    summary="One-time: fix R32 placeholder scheduled_at (corrects wrong/duplicate seed times for slots 10-16).",
    include_in_schema=False,
)
async def cron_fix_r32_dates(db: AsyncSession = Depends(get_db)) -> dict:
    from services.wc2026_seed import WC2026SeedService
    updated = await WC2026SeedService(db).fix_r32_dates()
    return {"status": "ok", "updated": updated}
