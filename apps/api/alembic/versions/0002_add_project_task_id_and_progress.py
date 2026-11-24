"""Add project task_id and progress

Revision ID: 0002_task_progress
Revises: 0001_initial
Create Date: 2026-11-12 12:50:00.000000

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0002_task_progress'
down_revision = '0001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    jsonb_type = postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite")
    op.add_column('projects', sa.Column('task_id', sa.String(length=100), nullable=True))
    op.create_index(op.f('ix_projects_task_id'), 'projects', ['task_id'], unique=False)
    op.add_column('projects', sa.Column('progress', jsonb_type, server_default='{}', nullable=False))


def downgrade() -> None:
    op.drop_column('projects', 'progress')
    op.drop_index(op.f('ix_projects_task_id'), table_name='projects')
    op.drop_column('projects', 'task_id')

