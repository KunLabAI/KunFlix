"""add_model_pricings_and_drop_agent_credit_fields

Revision ID: d7e8f9a0b1c2
Revises: cc40fa02de06
Create Date: 2026-05-20 10:00:00.000000

变更摘要：
1. 新建 model_pricings 表（按 provider_id+model 唯一），承载积分卖价。
2. 数据回填：
   - 从 agents 表的 9 个 *_credit_* 字段聚合（按 provider_id+model 去重，冲突取最大值）。
   - 从 llm_providers.model_costs 抽离 video_*/audio_generation 维度迁入卖价表，
     model_costs 内只保留 input/text_output/image_output 等 USD 进价键。
3. 删除 agents 表上的 9 个费率字段。

PostgreSQL / SQLite 双兼容（SQLite 用 batch_alter_table 重建表）。
"""
from typing import Sequence, Union, Dict, Any
import json

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7e8f9a0b1c2'
down_revision: Union[str, None] = 'e7a8b9c0d1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# 9 个待删除字段及其对应的 ModelPricing 维度名
_AGENT_CREDIT_COLUMNS: Dict[str, str] = {
    "input_credit_per_1m":         "input",
    "output_credit_per_1m":        "text_output",
    "image_output_credit_per_1m":  "image_output",
    "search_credit_per_query":     "search",
    "image_credit_per_image":      "image_generation",
    "video_input_image_credit":    "video_input_image",
    "video_input_second_credit":   "video_input_second",
    "video_output_480p_credit":    "video_output_480p",
    "video_output_720p_credit":    "video_output_720p",
}

# model_costs 中应当迁出到 ModelPricing（积分卖价）的维度键
# 注：当前 model_costs 同时承担"USD 进价"与"积分卖价"两层语义；这里仅迁移已知卖价键
_MIXED_DIMS_TO_MIGRATE = (
    "video_input_image", "video_input_second",
    "video_output_480p", "video_output_720p",
    "audio_generation",
)


def _new_uuid() -> str:
    import uuid
    return str(uuid.uuid4())


def _merge_dim(d: Dict[str, float], key: str, value: float) -> None:
    """同 (provider, model) 多 Agent 配置时取最大值，避免静默压价。"""
    try:
        v = float(value or 0)
    except (TypeError, ValueError):
        return
    if v <= 0:
        return
    prev = d.get(key, 0)
    d[key] = max(prev, v) if prev else v


def _backfill_pricings(conn) -> None:
    inspector = sa.inspect(conn)
    tables = set(inspector.get_table_names())
    if "agents" not in tables or "llm_providers" not in tables:
        return

    # 读出现有 agents 记录
    agent_cols = {c["name"] for c in inspector.get_columns("agents")}
    select_cols = ["provider_id", "model"] + [c for c in _AGENT_CREDIT_COLUMNS if c in agent_cols]
    if "provider_id" not in agent_cols or "model" not in agent_cols:
        return

    rows = conn.execute(sa.text(
        f'SELECT {", ".join(select_cols)} FROM agents WHERE provider_id IS NOT NULL AND model IS NOT NULL'
    )).fetchall()

    aggregated: Dict[tuple, Dict[str, float]] = {}
    for row in rows:
        d = dict(row._mapping) if hasattr(row, "_mapping") else dict(zip(select_cols, row))
        key = (d["provider_id"], d["model"])
        bucket = aggregated.setdefault(key, {})
        for col, dim in _AGENT_CREDIT_COLUMNS.items():
            if col in d:
                _merge_dim(bucket, dim, d.get(col) or 0)

    # 从 llm_providers.model_costs 抽离卖价维度，并回写仅含进价的 model_costs
    providers = conn.execute(sa.text(
        'SELECT id, model_costs FROM llm_providers WHERE model_costs IS NOT NULL'
    )).fetchall()

    provider_updates: Dict[str, Dict[str, Any]] = {}
    for row in providers:
        m = row._mapping if hasattr(row, "_mapping") else {"id": row[0], "model_costs": row[1]}
        provider_id = m["id"]
        raw = m["model_costs"]
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                continue
        if not isinstance(raw, dict):
            continue

        cleaned: Dict[str, Dict[str, float]] = {}
        changed = False
        for model_name, dims in raw.items():
            if not isinstance(dims, dict):
                cleaned[model_name] = dims
                continue
            api_only: Dict[str, float] = {}
            for k, v in dims.items():
                if k in _MIXED_DIMS_TO_MIGRATE:
                    bucket = aggregated.setdefault((provider_id, model_name), {})
                    _merge_dim(bucket, k, v)
                    changed = True
                else:
                    api_only[k] = v
            cleaned[model_name] = api_only
        if changed:
            provider_updates[provider_id] = cleaned

    # 写入 model_pricings
    if aggregated:
        for (provider_id, model_name), dims in aggregated.items():
            if not dims:
                continue
            conn.execute(
                sa.text(
                    "INSERT INTO model_pricings (id, provider_id, model, dimensions, is_active, notes, created_at) "
                    "VALUES (:id, :pid, :model, :dims, :active, :notes, CURRENT_TIMESTAMP)"
                ),
                {
                    "id": _new_uuid(),
                    "pid": provider_id,
                    "model": model_name,
                    "dims": json.dumps(dims),
                    "active": True,
                    "notes": "auto-backfill from agents/model_costs",
                },
            )

    # 回写 model_costs（仅 USD 进价）
    for provider_id, cleaned in provider_updates.items():
        conn.execute(
            sa.text("UPDATE llm_providers SET model_costs = :mc WHERE id = :pid"),
            {"mc": json.dumps(cleaned), "pid": provider_id},
        )


def upgrade() -> None:
    bind = op.get_bind()

    # 1. 创建 model_pricings 表
    op.create_table(
        "model_pricings",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("provider_id", sa.String(length=36), nullable=False),
        sa.Column("model", sa.String(length=200), nullable=False),
        sa.Column("dimensions", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["provider_id"], ["llm_providers.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_model_pricings_provider_id", "model_pricings", ["provider_id"], unique=False)
    op.create_index("ix_model_pricings_provider_model", "model_pricings", ["provider_id", "model"], unique=True)

    # 2. 数据回填
    _backfill_pricings(bind)

    # 3. 删除 agents 表上的 9 个 credit 字段
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("agents")}
    with op.batch_alter_table("agents", schema=None) as batch_op:
        for col in _AGENT_CREDIT_COLUMNS:
            if col in existing:
                batch_op.drop_column(col)


def downgrade() -> None:
    bind = op.get_bind()

    # 1. 恢复 agents 9 个字段（默认 0.0）
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("agents")}
    with op.batch_alter_table("agents", schema=None) as batch_op:
        for col in _AGENT_CREDIT_COLUMNS:
            if col not in existing:
                batch_op.add_column(sa.Column(col, sa.Float(), nullable=False, server_default="0.0"))

    # 2. 数据回灌（仅恢复维度名能直接对应的几个字段）
    rows = bind.execute(sa.text(
        "SELECT provider_id, model, dimensions FROM model_pricings WHERE is_active = 1"
    )).fetchall()
    for row in rows:
        m = row._mapping if hasattr(row, "_mapping") else {
            "provider_id": row[0], "model": row[1], "dimensions": row[2]
        }
        dims = m["dimensions"]
        if isinstance(dims, str):
            try:
                dims = json.loads(dims)
            except Exception:
                continue
        if not isinstance(dims, dict):
            continue
        sets = []
        params: Dict[str, Any] = {"pid": m["provider_id"], "model": m["model"]}
        for col, dim in _AGENT_CREDIT_COLUMNS.items():
            v = dims.get(dim)
            if v:
                sets.append(f"{col} = :{col}")
                params[col] = float(v)
        if sets:
            bind.execute(
                sa.text(
                    f"UPDATE agents SET {', '.join(sets)} WHERE provider_id = :pid AND model = :model"
                ),
                params,
            )

    # 3. 删除 model_pricings 表
    op.drop_index("ix_model_pricings_provider_model", table_name="model_pricings")
    op.drop_index("ix_model_pricings_provider_id", table_name="model_pricings")
    op.drop_table("model_pricings")
