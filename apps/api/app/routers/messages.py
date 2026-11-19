"""Chat messages and circuit snapshot endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import get_current_user
from app.db import get_db
from app.models import ChatMessage, CircuitSnapshot, Project, User
from app.schemas import (
    ChatMessageCreate,
    ChatMessageRead,
    CircuitSnapshotCreate,
    CircuitSnapshotRead,
)

router = APIRouter(prefix="/v1/projects/{project_id}", tags=["messages", "snapshots"])


async def _get_owned_project(project_id: UUID, user: User, db: AsyncSession) -> Project:
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == user.id,
            Project.is_deleted == False,
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


# ── Chat Messages ─────────────────────────────────────────────────────────────

@router.get("/messages", response_model=list[ChatMessageRead])
async def list_messages(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Retrieve chat message history for a project, oldest first."""
    await _get_owned_project(project_id, user, db)
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.project_id == project_id)
        .order_by(ChatMessage.created_at.asc())
    )
    return list(result.scalars().all())


@router.post("/messages", response_model=ChatMessageRead, status_code=status.HTTP_201_CREATED)
async def create_message(
    project_id: UUID,
    body: ChatMessageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Persist a user or mentor message in the conversation thread."""
    await _get_owned_project(project_id, user, db)
    msg = ChatMessage(
        project_id=project_id,
        user_id=user.id,
        role=body.role,
        content=body.content,
        hint_level=body.hint_level,
        mode=body.mode,
    )
    db.add(msg)
    await db.flush()
    return msg


# ── Circuit Snapshots ─────────────────────────────────────────────────────────

@router.get("/snapshots", response_model=list[CircuitSnapshotRead])
async def list_snapshots(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Retrieve circuit snapshots/history for a project, newest first."""
    await _get_owned_project(project_id, user, db)
    result = await db.execute(
        select(CircuitSnapshot)
        .where(CircuitSnapshot.project_id == project_id)
        .order_by(CircuitSnapshot.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/snapshots", response_model=CircuitSnapshotRead, status_code=status.HTTP_201_CREATED)
async def create_snapshot(
    project_id: UUID,
    body: CircuitSnapshotCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Save an immutable snapshot of circuit data for undo/history recovery."""
    project = await _get_owned_project(project_id, user, db)
    snapshot_data = body.circuit_data if body.circuit_data else (project.circuit_data or {})
    snapshot = CircuitSnapshot(
        project_id=project_id,
        circuit_data=snapshot_data,
    )
    db.add(snapshot)
    await db.flush()
    return snapshot
