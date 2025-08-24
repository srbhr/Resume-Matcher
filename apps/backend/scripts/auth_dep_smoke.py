import os
import sys


def main() -> int:
    # Ensure 'app' package is importable
    backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
    if backend_root not in sys.path:
        sys.path.insert(0, backend_root)

    from fastapi import Depends, FastAPI
    from fastapi.testclient import TestClient
    from app.core.auth import require_auth, Principal

    app = FastAPI()

    @app.get("/probe")
    async def probe(_p: Principal = Depends(require_auth)):
        return {"ok": True}

    c = TestClient(app)
    r = c.get("/probe")
    print("status:", r.status_code)
    print("json:", r.json())
    return 0 if r.status_code == 401 else 1


if __name__ == "__main__":
    raise SystemExit(main())
