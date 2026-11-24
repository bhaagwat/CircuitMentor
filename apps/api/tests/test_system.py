"""Tests for system endpoints: /health, /ready, security headers, rate limiting."""

import pytest


@pytest.mark.asyncio
async def test_health_endpoint(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_ready_endpoint(client):
    resp = await client.get("/ready")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ready"
    assert resp.json()["database"] == "connected"


@pytest.mark.asyncio
async def test_security_headers_present(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    headers = resp.headers
    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("x-frame-options") == "DENY"
    assert headers.get("x-xss-protection") == "1; mode=block"
    assert headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert "x-request-id" in headers


@pytest.mark.asyncio
async def test_auth_refresh_endpoint(client):
    # Register and login
    await client.post(
        "/v1/auth/register",
        json={
            "email": "refresh_user@example.com",
            "password": "password123",
            "display_name": "Refresh User",
        },
    )
    login_resp = await client.post(
        "/v1/auth/login",
        json={"email": "refresh_user@example.com", "password": "password123"},
    )
    token = login_resp.json()["access_token"]

    # Call /v1/auth/refresh
    refresh_resp = await client.post(
        "/v1/auth/refresh",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert refresh_resp.status_code == 200
    new_token = refresh_resp.json()["access_token"]
    assert new_token is not None

    # Validate new token works with /me
    me_resp = await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {new_token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "refresh_user@example.com"


@pytest.mark.asyncio
async def test_rate_limiting_triggers(client):
    from app.config import settings
    settings.rate_limit_enabled = True
    try:
        # Send 20 requests to /v1/auth/register (limit is 10)
        hit_429 = False
        for i in range(20):
            res = await client.post(
                "/v1/auth/register",
                json={
                    "email": f"rate_limit_{i}@example.com",
                    "password": "password123",
                    "display_name": f"User {i}",
                },
            )
            if res.status_code == 429:
                hit_429 = True
                assert "Too many requests" in res.json()["detail"]
                break
        assert hit_429 is True
    finally:
        settings.rate_limit_enabled = False

