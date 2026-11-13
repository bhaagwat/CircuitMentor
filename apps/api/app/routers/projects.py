"""Projects router: CRUD for circuit projects."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import get_current_user
from app.db import get_db
from app.models import Project, User
from app.schemas import ProjectCreate, ProjectRead, ProjectUpdate

router = APIRouter(prefix="/v1/projects", tags=["projects"])

DEMO_CIRCUIT_DATA = {
    "v": 1,
    "components": [
        {
            "id": "c1",
            "partId": "battery.9v",
            "designator": "BT1",
            "name": "9V Battery",
            "x": 160,
            "y": 200,
            "rotation": 0,
            "params": {"voltage": "9 V"},
        },
        {
            "id": "c2",
            "partId": "led.5mm.red",
            "designator": "D1",
            "name": "LED (Red 5mm)",
            "x": 380,
            "y": 200,
            "rotation": 0,
            "params": {"color": "Red", "forward_voltage": "2.0 V", "max_current": "20 mA"},
        },
        {
            "id": "c3",
            "partId": "ground",
            "designator": "GND1",
            "name": "Earth Ground",
            "x": 260,
            "y": 320,
            "rotation": 0,
            "params": {},
        },
    ],
    "wires": [
        {"id": "w1", "fromId": "c1", "fromPin": 0, "toId": "c2", "toPin": 0, "netType": "vcc"},
        {"id": "w2", "fromId": "c2", "fromPin": 1, "toId": "c3", "toPin": 0, "netType": "gnd"},
        {"id": "w3", "fromId": "c1", "fromPin": 1, "toId": "c3", "toPin": 0, "netType": "gnd"},
    ],
}


async def seed_demo_project_if_needed(db: AsyncSession, user_id: UUID) -> Project:
    demo = Project(
        owner_id=user_id,
        title="Demo: Direct LED (Overcurrent Hazard)",
        board_type="breadboard",
        goal="An LED wired directly to 9V without a current-limiting resistor triggers an ERC error. Fix it with a resistor.",
        circuit_data=DEMO_CIRCUIT_DATA,
    )
    db.add(demo)
    await db.flush()
    await db.refresh(demo)
    return demo


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = Project(
        owner_id=user.id,
        title=body.title,
        board_type=body.board_type,
        goal=body.goal,
        circuit_data=body.circuit_data or {},
        task_id=body.task_id,
        progress=body.progress or {},
    )
    db.add(project)
    await db.flush()
    return project


@router.get("", response_model=list[ProjectRead])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Project)
        .where(Project.owner_id == user.id, Project.is_deleted == False)
        .order_by(Project.updated_at.desc())
    )
    projects = list(result.scalars().all())
    if not projects:
        demo = await seed_demo_project_if_needed(db, user.id)
        return [demo]
    return projects


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
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


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: UUID,
    body: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
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

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)

    await db.flush()
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
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

    project.is_deleted = True
    await db.flush()
