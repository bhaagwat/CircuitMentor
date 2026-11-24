"""Pydantic v2 schemas for request/response validation."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# ── Auth ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=100)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserRead(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str | None = None
    avatar_url: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Projects ──────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    title: str = Field(default="Untitled circuit", max_length=200)
    board_type: str = Field(default="breadboard", pattern="^(breadboard|schematic|pcb)$")
    goal: str | None = None
    circuit_data: dict | None = None
    task_id: str | None = None
    progress: dict | None = None


class ProjectUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    board_type: str | None = Field(default=None, pattern="^(breadboard|schematic|pcb)$")
    goal: str | None = None
    circuit_data: dict | None = None
    task_id: str | None = None
    progress: dict | None = None


class ProjectRead(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    title: str
    board_type: str
    goal: str | None
    circuit_data: dict = Field(default_factory=dict)
    task_id: str | None = None
    progress: dict = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Chat Messages ─────────────────────────────────────────────────────────────

class ChatMessageCreate(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=4000)
    hint_level: int | None = Field(default=None, ge=1, le=4)
    mode: str | None = Field(default=None, pattern="^(question|concept)$")


class ChatMessageRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    content: str
    hint_level: int | None = None
    mode: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Circuit Snapshots ─────────────────────────────────────────────────────────

class CircuitSnapshotCreate(BaseModel):
    circuit_data: dict = Field(default_factory=dict)


class CircuitSnapshotRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    circuit_data: dict
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Parts ─────────────────────────────────────────────────────────────────────

class PartRead(BaseModel):
    id: uuid.UUID
    part_id: str
    name: str
    category: str
    description: str | None
    symbol_svg: str | None
    params_schema: dict | None
    pins: dict | None

    model_config = {"from_attributes": True}


class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int
