from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import StripeCustomer, CreditLedger


class InsufficientCreditsError(Exception):
    pass


class CreditsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def ensure_customer(self, *, clerk_user_id: str, stripe_customer_id: Optional[str] = None) -> StripeCustomer:
        row = await self.db.execute(select(StripeCustomer).where(StripeCustomer.clerk_user_id == clerk_user_id))
        customer = row.scalars().first()
        if customer:
            # Optionally update stripe_customer_id if newly provided
            if stripe_customer_id and not customer.stripe_customer_id:
                customer.stripe_customer_id = stripe_customer_id
            return customer
        customer = StripeCustomer(clerk_user_id=clerk_user_id, stripe_customer_id=stripe_customer_id)
        self.db.add(customer)
        await self.db.flush()
        return customer

    async def get_balance(self, *, clerk_user_id: str) -> int:
        # Prefer reading from the view; fallback to sum if view not present
        try:
            res = await self.db.execute(
                text("SELECT balance FROM v_credit_balance WHERE clerk_user_id = :uid"),
                {"uid": clerk_user_id},
            )
            val = res.scalar_one_or_none()
            if val is not None:
                return int(val)
        except Exception:
            pass
        res = await self.db.execute(
            select(text("COALESCE(SUM(delta), 0)")).select_from(CreditLedger).where(CreditLedger.clerk_user_id == clerk_user_id)
        )
        return int(res.scalar_one() or 0)

    async def credit_purchase(self, *, clerk_user_id: str, delta: int, reason: str, stripe_event_id: Optional[str]) -> None:
        # Insert a positive delta for a purchase; rely on partial unique index for idempotent stripe_event_id
        entry = CreditLedger(
            clerk_user_id=clerk_user_id,
            delta=delta,
            reason=reason,
            stripe_event_id=stripe_event_id,
        )
        self.db.add(entry)
        # flush surfaces unique violations eagerly
        await self.db.flush()

    async def debit_usage(self, *, clerk_user_id: str, delta: int, reason: str) -> None:
        # delta is a positive count of credits to deduct; we'll insert negative
        to_deduct = int(delta)
        if to_deduct <= 0:
            return
        # Lock the user row to prevent concurrent overdrafts
        await self.ensure_customer(clerk_user_id=clerk_user_id)
        await self.db.execute(text("SELECT 1 FROM stripe_customers WHERE clerk_user_id = :uid FOR UPDATE"), {"uid": clerk_user_id})
        bal = await self.get_balance(clerk_user_id=clerk_user_id)
        if bal < to_deduct:
            raise InsufficientCreditsError("not_enough_credits")
        entry = CreditLedger(
            clerk_user_id=clerk_user_id,
            delta=-to_deduct,
            reason=reason,
            stripe_event_id=None,
        )
        self.db.add(entry)
        await self.db.flush()
