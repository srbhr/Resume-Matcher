from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.router.v1.auth import auth_router


def create_app() -> FastAPI:
    app = FastAPI()
    app.include_router(auth_router, prefix="/api/v1/auth")
    return app


def test_whoami_requires_auth():
    app = create_app()
    client = TestClient(app)
    resp = client.get("/api/v1/auth/whoami")
    assert resp.status_code == 401
    body = resp.json()
    assert isinstance(body, dict)
    assert body.get("detail")
