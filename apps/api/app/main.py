"""CircuitMentor API — FastAPI application entry point."""

from __future__ import annotations

import time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.google import router as google_auth_router
from app.auth.router import router as auth_router
from app.config import settings
from app.db import engine, get_db
from app.routers.parts import router as parts_router
from app.routers.projects import router as projects_router
from app.routers.mentor import router as mentor_router
from app.routers.messages import router as messages_router


# In-memory sliding window rate limiter
_RATE_LIMIT_BUCKETS: dict[str, list[float]] = defaultdict(list)
_RATE_LIMITS: dict[str, tuple[int, int]] = {
    "/v1/mentor/stream": (30, 60),  # 30 requests per 60 seconds
    "/v1/auth/login": (15, 60),     # 15 attempts per 60 seconds
    "/v1/auth/register": (10, 60),  # 10 attempts per 60 seconds
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    try:
        from app.models import Base
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        import logging
        logging.getLogger("circuitmentor").warning("Could not auto-create tables on startup: %s", e)
    yield
    await engine.dispose()


app = FastAPI(
    title="CircuitMentor API",
    description="AI-mentored circuit simulation learning platform",
    version="0.1.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def security_and_rate_limit_middleware(request: Request, call_next):
    # 1. Rate limiting check
    client_ip = request.client.host if request.client else "unknown"
    path = request.url.path
    if settings.rate_limit_enabled and path in _RATE_LIMITS:
        limit, window_seconds = _RATE_LIMITS[path]
        now = time.time()
        bucket_key = f"{client_ip}:{path}"
        timestamps = _RATE_LIMIT_BUCKETS[bucket_key]
        # Prune old timestamps
        _RATE_LIMIT_BUCKETS[bucket_key] = [ts for ts in timestamps if now - ts < window_seconds]
        if len(_RATE_LIMIT_BUCKETS[bucket_key]) >= limit:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Too many requests. Please try again shortly."},
                headers={"Retry-After": str(window_seconds)},
            )
        _RATE_LIMIT_BUCKETS[bucket_key].append(now)

    # 2. Request ID tracing
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    
    # 3. Process request
    response: Response = await call_next(request)

    # 4. Security & tracing headers
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if settings.cookie_secure:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return response


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Routers
app.include_router(google_auth_router)
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(parts_router)
app.include_router(mentor_router)
app.include_router(messages_router)


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "service": "circuitmentor-api"}


@app.get("/ready", tags=["system"])
async def ready(db: AsyncSession = Depends(get_db)):
    """Readiness probe checking database connectivity."""
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "ready", "database": "connected"}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database check failed: {str(exc)}",
        )

