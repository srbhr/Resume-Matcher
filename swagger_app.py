from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

app = FastAPI()

# Optionally, generate custom OpenAPI schema
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title="Resume Matcher API",
        version="1.0.0",
        description="An API for processing resumes and job descriptions, calculating similarity scores, and managing job data.",
        routes=app.routes,
    )
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

# Run the FastAPI application with Swagger UI
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=8000, log_level="info", reload=True)
