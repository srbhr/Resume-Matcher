from fastapi import APIRouter, Depends
from app.core.auth import require_auth, Principal

auth_router = APIRouter()


@auth_router.get("/whoami")
async def whoami(principal: Principal = Depends(require_auth)):
    return {"data": {"user_id": principal.user_id, "email": principal.email}}
