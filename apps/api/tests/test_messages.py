"""Tests for chat messages and circuit snapshots (F03, F11)."""

import pytest


async def _register_and_create_project(client, email: str) -> tuple[str, str]:
    reg = await client.post(
        "/v1/auth/register",
        json={
            "email": email,
            "password": "password12345",
            "display_name": email.split("@")[0],
        },
    )
    token = reg.json()["access_token"]
    proj = await client.post(
        "/v1/projects",
        json={"title": "Chat Test Circuit", "board_type": "breadboard"},
        headers={"Authorization": f"Bearer {token}"},
    )
    return token, proj.json()["id"]


@pytest.mark.asyncio
async def test_chat_messages_lifecycle(client):
    """F03: Test creating and retrieving chat messages for a project."""
    token, project_id = await _register_and_create_project(client, "student_chat@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Post a user question
    r1 = await client.post(
        f"/v1/projects/{project_id}/messages",
        json={
            "role": "user",
            "content": "Why is my LED not lighting up?",
            "hint_level": 1,
            "mode": "question",
        },
        headers={**headers},
    )
    assert r1.status_code == 201
    msg1 = r1.json()
    assert msg1["role"] == "user"
    assert msg1["content"] == "Why is my LED not lighting up?"
    assert msg1["hint_level"] == 1

    # 2. Post an assistant response
    r2 = await client.post(
        f"/v1/projects/{project_id}/messages",
        json={
            "role": "assistant",
            "content": "Check your resistor value and diode polarity.",
            "hint_level": 2,
            "mode": "question",
        },
        headers={**headers},
    )
    assert r2.status_code == 201

    # 3. List messages -> both must be present in order
    list_r = await client.get(f"/v1/projects/{project_id}/messages", headers={**headers})
    assert list_r.status_code == 200
    messages = list_r.json()
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"


@pytest.mark.asyncio
async def test_circuit_snapshots_lifecycle(client):
    """F11: Test saving and listing circuit snapshots."""
    token, project_id = await _register_and_create_project(client, "snapshot_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a snapshot
    snap_resp = await client.post(
        f"/v1/projects/{project_id}/snapshots",
        json={"circuit_data": {"components": [{"id": "r1", "value": "220"}], "wires": []}},
        headers={**headers},
    )
    assert snap_resp.status_code == 201
    snap = snap_resp.json()
    assert snap["circuit_data"]["components"][0]["id"] == "r1"

    # 2. List snapshots
    list_resp = await client.get(f"/v1/projects/{project_id}/snapshots", headers={**headers})
    assert list_resp.status_code == 200
    snapshots = list_resp.json()
    assert len(snapshots) == 1


@pytest.mark.asyncio
async def test_messages_ownership_isolation(client):
    """Verify that User B cannot post or read messages on User A's project."""
    token_a, project_id = await _register_and_create_project(client, "alice_msg@example.com")

    # Register Bob
    reg_b = await client.post(
        "/v1/auth/register",
        json={
            "email": "bob_msg@example.com",
            "password": "password12345",
            "display_name": "Bob",
        },
    )
    token_b = reg_b.json()["access_token"]

    # Bob tries to read Alice's messages -> 404
    r_get = await client.get(
        f"/v1/projects/{project_id}/messages",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert r_get.status_code == 404

    # Bob tries to post message to Alice's project -> 404
    r_post = await client.post(
        f"/v1/projects/{project_id}/messages",
        json={"role": "user", "content": "Trying to snoop"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert r_post.status_code == 404
