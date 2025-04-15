from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from uuid import uuid4

class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path_parts = request.url.path.strip("/").split("/")
        
        # Safely grab the 3rd part: /api/v1/<service>
        service_tag = f"{path_parts[2]}:" if len(path_parts) > 2 else ""

        request_id = f"{service_tag}{uuid4()}"
        request.state.request_id = request_id

        response = await call_next(request)
        return response