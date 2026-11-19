"""Add composite indexes and board_type check constraint to projects.

Revision ID: 0003_indexes_constraints
Revises: 0002_task_progress
Create Date: 2026-11-20 02:30:00.000000

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = '0003_indexes_constraints'
down_revision = '0002_task_progress'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('projects') as batch_op:
        batch_op.create_index('ix_projects_owner_is_deleted', ['owner_id', 'is_deleted'], unique=False)
        batch_op.create_index('ix_projects_owner_updated', ['owner_id', 'updated_at'], unique=False)
        batch_op.create_check_constraint('ck_projects_board_type', "board_type IN ('breadboard','schematic','pcb')")


def downgrade() -> None:
    with op.batch_alter_table('projects') as batch_op:
        batch_op.drop_constraint('ck_projects_board_type', type_='check')
        batch_op.drop_index('ix_projects_owner_updated')
        batch_op.drop_index('ix_projects_owner_is_deleted')
