import os
import json
import pytest
import httpx
from fastapi import FastAPI

from app.base import create_app
from app.services.credits_service import CreditsService, InsufficientCreditsError


pytestmark = pytest.mark.asyncio


@pytest.fixture()
def test_user_id():
    return "test-user"


async def _get_test_app():
    return create_app()


async def test_credits_service_balance_and_debit(db_session, test_user_id):
    svc = CreditsService(db_session)
    await svc.ensure_customer(clerk_user_id=test_user_id)
    assert await svc.get_balance(clerk_user_id=test_user_id) == 0

    # Credit +100
    await svc.credit_purchase(clerk_user_id=test_user_id, delta=100, reason="test", stripe_event_id="evt_1")
    await db_session.commit()
    assert await svc.get_balance(clerk_user_id=test_user_id) == 100

    # Idempotent: inserting same event should raise unique violation on commit/flush; simulate by try/commit
    with pytest.raises(Exception):
        await svc.credit_purchase(clerk_user_id=test_user_id, delta=100, reason="test", stripe_event_id="evt_1")
        await db_session.commit()
    await db_session.rollback()

    # Debit 30
    await svc.debit_usage(clerk_user_id=test_user_id, delta=30, reason="use")
    await db_session.commit()
    assert await svc.get_balance(clerk_user_id=test_user_id) == 70

    # Over-debit should raise
    with pytest.raises(InsufficientCreditsError):
        await svc.debit_usage(clerk_user_id=test_user_id, delta=100, reason="use")


async def test_credits_endpoints(db_session, monkeypatch, test_user_id):
    # Disable auth for endpoints
    monkeypatch.setenv("DISABLE_AUTH_FOR_TESTS", "1")
    app = await _get_test_app()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Start with zero
        resp = await client.get("/api/v1/me/credits")
        assert resp.status_code == 200
        assert resp.json()["data"]["balance"] == 0

        # Directly credit via service to simulate webhook (endpoint stub returns 204)
        svc = CreditsService(db_session)
        await svc.credit_purchase(clerk_user_id=test_user_id, delta=50, reason="test", stripe_event_id="evt_api")
        await db_session.commit()

        resp = await client.get("/api/v1/me/credits")
        assert resp.status_code == 200
        assert resp.json()["data"]["balance"] == 50

        # Debit 20 via endpoint
        resp = await client.post("/api/v1/credits/debit", json={"delta": 20})
        assert resp.status_code == 200
        assert resp.json()["data"]["balance"] == 30

        # Over-debit via endpoint -> 402
        resp = await client.post("/api/v1/credits/debit", json={"delta": 100})
        assert resp.status_code == 402
        body = resp.json()
        assert body["error"]["code"] == "INSUFFICIENT_CREDITS"
