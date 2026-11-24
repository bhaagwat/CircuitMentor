"""CircuitMentor API — FastAPI application entry point."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.google import router as google_auth_router
from app.auth.router import router as auth_router
from app.config import settings
from app.db import engine
from app.routers.parts import router as parts_router
from app.routers.projects import router as projects_router
from app.routers.mentor import router as mentor_router
from app.routers.messages import router as messages_router


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
