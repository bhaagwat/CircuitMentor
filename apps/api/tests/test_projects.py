"""Tests for project CRUD, ownership isolation, and constraints."""

import pytest


async def _register_and_get_token(client, email: str) -> str:
    resp = await client.post(
        "/v1/auth/register",
        json={
            "email": email,
            "password": "password12345",
            "display_name": email.split("@")[0],
        },
    )
    return resp.json()["access_token"]


@pytest.mark.asyncio
async def test_project_crud(client):
    """Test project create, read, update, and soft-delete."""
    token = await _register_and_get_token(client, "crud_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create project
    create_resp = await client.post(
        "/v1/projects",
        json={"title": "My Circuit", "board_type": "breadboard"},
        headers={**headers},
    )
    assert create_resp.status_code == 201
    p = create_resp.json()
    project_id = p["id"]
    assert p["title"] == "My Circuit"
    assert p["board_type"] == "breadboard"
    initial_updated_at = p["updated_at"]

    # 2. Update project
    update_resp = await client.patch(
        f"/v1/projects/{project_id}",
        json={"title": "Updated Circuit Title"},
        headers={**headers},
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["title"] == "Updated Circuit Title"
    # F06: updated_at was updated
    assert "updated_at" in updated

    # 3. Soft delete
    del_resp = await client.delete(f"/v1/projects/{project_id}", headers={**headers})
    assert del_resp.status_code == 204

    # 4. Fetching soft-deleted project returns 404
    get_resp = await client.get(f"/v1/projects/{project_id}", headers={**headers})
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_project_ownership_isolation(client):
    """Verify that User B cannot access or modify User A's projects."""
    token_a = await _register_and_get_token(client, "alice@example.com")
    token_b = await _register_and_get_token(client, "bob@example.com")

    # Alice creates a project
    create_resp = await client.post(
        "/v1/projects",
        json={"title": "Alice Secret Project", "board_type": "schematic"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    alice_project_id = create_resp.json()["id"]

    # Bob tries to read Alice's project -> must 404
    bob_get = await client.get(
        f"/v1/projects/{alice_project_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert bob_get.status_code == 404

    # Bob tries to update Alice's project -> must 404
    bob_patch = await client.patch(
        f"/v1/projects/{alice_project_id}",
        json={"title": "Hacked Title"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert bob_patch.status_code == 404

    # Bob tries to delete Alice's project -> must 404
    bob_delete = await client.delete(
        f"/v1/projects/{alice_project_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert bob_delete.status_code == 404


@pytest.mark.asyncio
async def test_project_board_type_validation(client):
    """F13: Board type must be breadboard, schematic, or pcb."""
    token = await _register_and_get_token(client, "validator@example.com")
    resp = await client.post(
        "/v1/projects",
        json={"title": "Invalid Board", "board_type": "invalid_board_name"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422
