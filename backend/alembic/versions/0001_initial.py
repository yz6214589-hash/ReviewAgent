"""initial: 7 张业务表（SSD 3.4）

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-30
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "review_tasks",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("project_name", sa.Text()),
        sa.Column("status", sa.Text()),
        sa.Column("current_step", sa.Integer()),
        sa.Column("created_at", sa.Text()),
        sa.Column("updated_at", sa.Text()),
    )
    op.create_table(
        "classifications",
        sa.Column("task_id", sa.Text(), primary_key=True),
        sa.Column("project_type", sa.Text()),
        sa.Column("stage", sa.Text()),
        sa.Column("sub_domain", sa.Text()),
        sa.Column("year", sa.Integer()),
        sa.Column("is_applied_basic", sa.Boolean()),
        sa.Column("is_combined", sa.Boolean()),
        sa.Column("confidence", sa.Text()),
        sa.Column("confirmed", sa.Boolean()),
        sa.Column("corrected_by", sa.Text()),
        sa.Column("corrected_at", sa.Text()),
    )
    op.create_table(
        "review_results",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("task_id", sa.Text()),
        sa.Column("stage", sa.Text()),
        sa.Column("template_id", sa.Text()),
        sa.Column("content", sa.Text()),
        sa.Column("total_score_range", sa.Text()),
        sa.Column("created_at", sa.Text()),
    )
    op.create_table(
        "artifact_versions",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("task_id", sa.Text()),
        sa.Column("file_type", sa.Text()),
        sa.Column("version", sa.Integer()),
        sa.Column("file_path", sa.Text()),
        sa.Column("source", sa.Text()),
        sa.Column("created_at", sa.Text()),
    )
    op.create_table(
        "scoring_templates",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("name", sa.Text()),
        sa.Column("category", sa.Text()),
        sa.Column("stage", sa.Text()),
        sa.Column("dimensions", sa.Text()),
        sa.Column("is_active", sa.Boolean()),
    )
    op.create_table(
        "fewshot_samples",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("project_name", sa.Text()),
        sa.Column("project_type", sa.Text()),
        sa.Column("stage", sa.Text()),
        sa.Column("sub_domain", sa.Text()),
        sa.Column("content", sa.Text()),
        sa.Column("is_active", sa.Boolean()),
    )
    op.create_table(
        "config_history",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("config_key", sa.Text()),
        sa.Column("old_value", sa.Text()),
        sa.Column("new_value", sa.Text()),
        sa.Column("changed_by", sa.Text()),
        sa.Column("changed_at", sa.Text()),
    )


def downgrade() -> None:
    op.drop_table("config_history")
    op.drop_table("fewshot_samples")
    op.drop_table("scoring_templates")
    op.drop_table("artifact_versions")
    op.drop_table("review_results")
    op.drop_table("classifications")
    op.drop_table("review_tasks")
