from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api.router.v1.auth import auth_router


def main() -> int:
    app = FastAPI()
    app.include_router(auth_router, prefix="/api/v1/auth")
    client = TestClient(app)
    r = client.get("/api/v1/auth/whoami")
    print("status:", r.status_code)
    print("body:", r.json())
    return 0 if r.status_code == 401 else 1


if __name__ == "__main__":
    raise SystemExit(main())
