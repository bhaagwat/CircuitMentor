"""Tests for authentication endpoints and security fixes."""

import pytest
from app.models import User


@pytest.mark.asyncio
async def test_register_success(client):
    """Test user registration returns 201 and access token."""
    resp = await client.post(
        "/v1/auth/register",
        json={
            "email": "student@example.com",
            "password": "securepassword123",
            "display_name": "Ada Lovelace",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    """Test registering with an existing email returns 409."""
    user_data = {
        "email": "duplicate@example.com",
        "password": "securepassword123",
        "display_name": "Test User",
    }
    r1 = await client.post("/v1/auth/register", json=user_data)
    assert r1.status_code == 201

    r2 = await client.post("/v1/auth/register", json=user_data)
    assert r2.status_code == 409
    assert "already exists" in r2.json()["detail"]


@pytest.mark.asyncio
async def test_login_and_me_profile(client):
    """Test login and /me endpoint. F14: Verifies google_sub is NOT in response."""
    await client.post(
        "/v1/auth/register",
        json={
            "email": "me_test@example.com",
            "password": "securepassword123",
            "display_name": "Test Profile",
        },
    )
    login_resp = await client.post(
        "/v1/auth/login",
        json={"email": "me_test@example.com", "password": "securepassword123"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    me_resp = await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    user_info = me_resp.json()
    assert user_info["email"] == "me_test@example.com"
    assert user_info["display_name"] == "Test Profile"
    # F14 Fix check: google_sub must NOT be exposed in API output
    assert "google_sub" not in user_info


@pytest.mark.asyncio
async def test_login_google_only_user_does_not_crash(client, db_session):
    """F18 Fix: User with hashed_password=None must return 401, not 500 TypeError."""
    google_user = User(
        email="google_oauth@example.com",
        google_sub="1234567890",
        hashed_password=None,
        display_name="Google User",
    )
    db_session.add(google_user)
    await db_session.commit()

    resp = await client.post(
        "/v1/auth/login",
        json={"email": "google_oauth@example.com", "password": "anypassword"},
    )
    assert resp.status_code == 401
    assert "Invalid email or password" in resp.json()["detail"]
