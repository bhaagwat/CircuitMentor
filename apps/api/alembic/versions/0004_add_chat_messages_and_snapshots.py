"""Add chat_messages and circuit_snapshots tables.

Revision ID: 0004_chat_snapshots
Revises: 0003_indexes_constraints
Create Date: 2026-11-20 02:32:00.000000

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0004_chat_snapshots'
down_revision = '0003_indexes_constraints'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── chat_messages ──────────────────────────────────────────────────────────
    op.create_table(
        'chat_messages',
        sa.Column('id', sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column('project_id', sa.Uuid(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Uuid(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(length=10), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('hint_level', sa.Integer(), nullable=True),
        sa.Column('mode', sa.String(length=20), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    with op.batch_alter_table('chat_messages') as batch_op:
        batch_op.create_check_constraint('ck_chat_messages_role', "role IN ('user','assistant')")
        batch_op.create_index('ix_chat_messages_project_id', ['project_id'], unique=False)
        batch_op.create_index('ix_chat_messages_user_id', ['user_id'], unique=False)
        batch_op.create_index('ix_chat_messages_project_created', ['project_id', 'created_at'], unique=False)

    # ── circuit_snapshots ──────────────────────────────────────────────────────
    op.create_table(
        'circuit_snapshots',
        sa.Column('id', sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column('project_id', sa.Uuid(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column(
            'circuit_data',
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"),
            server_default='{}',
            nullable=False,
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    with op.batch_alter_table('circuit_snapshots') as batch_op:
        batch_op.create_index('ix_circuit_snapshots_project_id', ['project_id'], unique=False)


def downgrade() -> None:
    op.drop_table('circuit_snapshots')
    op.drop_table('chat_messages')
