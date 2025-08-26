from __future__ import annotations

import logging
from uuid import uuid4
from typing import Optional

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import get_db_session
from app.core.auth import require_auth, Principal
from app.core.error_codes import to_error_payload
from app.services.credits_service import CreditsService, InsufficientCreditsError


logger = logging.getLogger(__name__)
credits_router = APIRouter()


class DebitRequest(BaseModel):
    delta: int = Field(..., gt=0, description="Number of credits to deduct (positive integer)")
    reason: Optional[str] = Field(default="usage", description="Reason for debit entry")


@credits_router.get("/me/credits", summary="Get current user's credit balance")
async def get_my_credits(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    principal: Principal = Depends(require_auth),
):
    request_id = getattr(request.state, "request_id", str(uuid4()))
    try:
        svc = CreditsService(db)
        balance = await svc.get_balance(clerk_user_id=principal.user_id)
        return JSONResponse(content={"request_id": request_id, "data": {"balance": int(balance)}})
    except Exception as e:
        code, payload = to_error_payload(e, request_id)
        return JSONResponse(status_code=code, content=payload)


@credits_router.post("/credits/debit", summary="Debit credits for usage")
async def debit_credits(
    request: Request,
    body: DebitRequest,
    db: AsyncSession = Depends(get_db_session),
    principal: Principal = Depends(require_auth),
):
    request_id = getattr(request.state, "request_id", str(uuid4()))
    try:
        svc = CreditsService(db)
        await svc.debit_usage(
            clerk_user_id=principal.user_id,
            delta=body.delta,
            reason=body.reason or "usage",
        )
        new_balance = await svc.get_balance(clerk_user_id=principal.user_id)
        return JSONResponse(content={"request_id": request_id, "data": {"balance": int(new_balance)}})
    except InsufficientCreditsError as e:
        return JSONResponse(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            content={
                "request_id": request_id,
                "error": {"code": "INSUFFICIENT_CREDITS", "message": str(e) or "Not enough credits"},
            },
        )
    except Exception as e:
        code, payload = to_error_payload(e, request_id)
        return JSONResponse(status_code=code, content=payload)


@credits_router.post("/stripe/webhook", summary="Stripe webhook (stub)")
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
):
    """Webhook stub: accept the event and return 204.

    In Phase 3, verify signature and credit purchases idempotently via CreditsService.credit_purchase.
    """
    request_id = getattr(request.state, "request_id", str(uuid4()))
    try:
        raw = await request.body()
        sig = request.headers.get("Stripe-Signature", "")
        logger.info("stripe_webhook received", extra={"bytes": len(raw), "sig_present": bool(sig)})
        return JSONResponse(status_code=status.HTTP_204_NO_CONTENT, content=None)
    except Exception as e:
        code, payload = to_error_payload(e, request_id)
        return JSONResponse(status_code=code, content=payload)
