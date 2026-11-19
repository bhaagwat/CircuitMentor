"""Google OAuth 2.0 (Authorization Code + PKCE) authentication."""

from __future__ import annotations

import base64
import hashlib
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse
from google.auth.transport import requests as grequests
from google.oauth2 import id_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import create_access_token
from app.config import settings
from app.db import get_db
from app.models import User

router = APIRouter(prefix="/v1/auth/google", tags=["auth"])
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"

ALLOWED_RETURN_ORIGINS = {
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    settings.web_url.rstrip("/"),
}


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _get_cookie_opts():
    return dict(httponly=True, samesite="lax", secure=settings.cookie_secure, path="/")


@router.get("/login")
async def login(request: Request):
    state = _b64(secrets.token_bytes(32))
    verifier = _b64(secrets.token_bytes(32))

    # Allowlisted return origin selection
    referer = request.headers.get("referer") or ""
    origin_web_url = settings.web_url
    for allowed in ALLOWED_RETURN_ORIGINS:
        if referer.startswith(allowed):
            origin_web_url = allowed
            break

    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": _b64(hashlib.sha256(verifier.encode()).digest()),
        "code_challenge_method": "S256",
    }
    resp = RedirectResponse(f"{AUTH_URL}?{urlencode(params)}")
    cookie_opts = _get_cookie_opts()
    resp.set_cookie("oauth_state", state, max_age=600, **cookie_opts)
    resp.set_cookie("oauth_verifier", verifier, max_age=600, **cookie_opts)
    resp.set_cookie("oauth_return_url", origin_web_url, max_age=600, **cookie_opts)
    return resp


@router.get("/callback")
async def callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    if error or not code:
        return RedirectResponse(f"{settings.web_url}/login?error=cancelled")
    if not state or state != request.cookies.get("oauth_state"):
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    cookie_verifier = request.cookies.get("oauth_verifier", "")
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            TOKEN_URL,
            data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "code": code,
                "code_verifier": cookie_verifier,
                "grant_type": "authorization_code",
                "redirect_uri": settings.google_redirect_uri,
            },
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Google token exchange failed")

    # verifies signature, issuer, audience and expiry
    claims = await run_in_threadpool(
        id_token.verify_oauth2_token,
        r.json()["id_token"],
        grequests.Request(),
        settings.google_client_id,
    )

    user = (
        await db.execute(select(User).where(User.google_sub == claims["sub"]))
    ).scalar_one_or_none()
    if not user:
        user = User(
            google_sub=claims["sub"],
            email=claims["email"],
            display_name=claims.get("name"),
            avatar_url=claims.get("picture"),
        )
        db.add(user)
    else:
        user.avatar_url = claims.get("picture")
        if claims.get("name"):
            user.display_name = claims.get("name")
    await db.commit()
    await db.refresh(user)

    return_url = request.cookies.get("oauth_return_url") or settings.web_url
    if return_url not in ALLOWED_RETURN_ORIGINS:
        return_url = settings.web_url
    resp = RedirectResponse(f"{return_url.rstrip('/')}/dashboard")
    cookie_opts = _get_cookie_opts()
    resp.set_cookie("cm_token", create_access_token(str(user.id)), max_age=7 * 86400, **cookie_opts)
    resp.delete_cookie("oauth_state", path="/")
    resp.delete_cookie("oauth_verifier", path="/")
    resp.delete_cookie("oauth_return_url", path="/")
    return resp


@router.post("/logout")
async def logout():
    resp = RedirectResponse(settings.web_url, status_code=303)
    resp.delete_cookie("cm_token", path="/")
    return resp

