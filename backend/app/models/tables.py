"""7 张业务表（与 SSD 3.4 DDL 一致）。"""
from __future__ import annotations

from sqlalchemy import Boolean, Integer, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class ReviewTask(Base):
    __tablename__ = "review_tasks"
    # status: draft/classified/generating/reviewing/done
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    project_name: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(Text)
    current_step: Mapped[int | None] = mapped_column(Integer)  # 1-4
    created_at: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[str | None] = mapped_column(Text)


class Classification(Base):
    __tablename__ = "classifications"
    task_id: Mapped[str] = mapped_column(Text, primary_key=True)
    project_type: Mapped[str | None] = mapped_column(Text)
    stage: Mapped[str | None] = mapped_column(Text)  # summary/proposal/combined
    sub_domain: Mapped[str | None] = mapped_column(Text)
    year: Mapped[int | None] = mapped_column(Integer)
    is_applied_basic: Mapped[bool | None] = mapped_column(Boolean)
    is_combined: Mapped[bool | None] = mapped_column(Boolean)
    confidence: Mapped[str | None] = mapped_column(Text)  # JSON
    confirmed: Mapped[bool | None] = mapped_column(Boolean)
    corrected_by: Mapped[str | None] = mapped_column(Text)
    corrected_at: Mapped[str | None] = mapped_column(Text)


class ReviewResult(Base):
    __tablename__ = "review_results"
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    task_id: Mapped[str | None] = mapped_column(Text)
    stage: Mapped[str | None] = mapped_column(Text)  # summary/proposal
    template_id: Mapped[str | None] = mapped_column(Text)
    content: Mapped[str | None] = mapped_column(Text)
    total_score_range: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str | None] = mapped_column(Text)


class ArtifactVersion(Base):
    __tablename__ = "artifact_versions"
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    task_id: Mapped[str | None] = mapped_column(Text)
    file_type: Mapped[str | None] = mapped_column(Text)  # word_summary/word_proposal/md
    version: Mapped[int | None] = mapped_column(Integer)
    file_path: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str | None] = mapped_column(Text)  # ai_draft/manual_edit/regenerate
    created_at: Mapped[str | None] = mapped_column(Text)


class ScoringTemplate(Base):
    __tablename__ = "scoring_templates"
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(Text)  # applied_basic/non_applied_basic
    stage: Mapped[str | None] = mapped_column(Text)  # summary/proposal
    dimensions: Mapped[str | None] = mapped_column(Text)  # JSON
    is_active: Mapped[bool | None] = mapped_column(Boolean)


class FewshotSample(Base):
    __tablename__ = "fewshot_samples"
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    project_name: Mapped[str | None] = mapped_column(Text)
    project_type: Mapped[str | None] = mapped_column(Text)
    stage: Mapped[str | None] = mapped_column(Text)
    sub_domain: Mapped[str | None] = mapped_column(Text)
    content: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool | None] = mapped_column(Boolean)


class ConfigHistory(Base):
    __tablename__ = "config_history"
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    config_key: Mapped[str | None] = mapped_column(Text)
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    changed_by: Mapped[str | None] = mapped_column(Text)
    changed_at: Mapped[str | None] = mapped_column(Text)
