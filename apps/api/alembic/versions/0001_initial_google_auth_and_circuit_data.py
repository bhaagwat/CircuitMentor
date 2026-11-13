"""Initial migration: google auth and circuit_data

Revision ID: 0001_initial
Revises: 
Create Date: 2026-11-10 16:55:00.000000

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users table ────────────────────────────────────────────────────────────
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('google_sub', sa.String(length=100), nullable=True),
        sa.Column('email', sa.String(length=320), nullable=False),
        sa.Column('hashed_password', sa.String(length=128), nullable=True),
        sa.Column('display_name', sa.String(length=100), nullable=True),
        sa.Column('avatar_url', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(op.f('ix_users_google_sub'), 'users', ['google_sub'], unique=True)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    # ── projects table ─────────────────────────────────────────────────────────
    op.create_table(
        'projects',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('owner_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('board_type', sa.String(length=50), nullable=False),
        sa.Column('goal', sa.Text(), nullable=True),
        sa.Column('circuit_data', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), default=False, nullable=False),
    )
    op.create_index(op.f('ix_projects_owner_id'), 'projects', ['owner_id'], unique=False)

    # ── parts table ────────────────────────────────────────────────────────────
    op.create_table(
        'parts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('part_id', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('symbol_svg', sa.Text(), nullable=True),
        sa.Column('params_schema', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('pins', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(op.f('ix_parts_part_id'), 'parts', ['part_id'], unique=True)
    op.create_index(op.f('ix_parts_category'), 'parts', ['category'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_parts_category'), table_name='parts')
    op.drop_index(op.f('ix_parts_part_id'), table_name='parts')
    op.drop_table('parts')
    op.drop_index(op.f('ix_projects_owner_id'), table_name='projects')
    op.drop_table('projects')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_index(op.f('ix_users_google_sub'), table_name='users')
    op.drop_table('users')

