"""
多维度积分计费计算器 - 映射表驱动，避免 if 分支
"""
from typing import Dict, Tuple

# 计费维度映射表：dim_name -> (Agent 费率字段, scale)
# scale=1_000_000 表示每 1M tokens 计费，scale=1 表示每次计费
BILLING_DIMENSIONS = {
    "input":        ("input_credit_per_1m",         1_000_000),
    "text_output":  ("output_credit_per_1m",        1_000_000),
    "image_output": ("image_output_credit_per_1m",  1_000_000),
    "search":       ("search_credit_per_query",     1),
}


def calculate_credit_cost(result, agent) -> Tuple[float, Dict]:
    """
    计算总积分费用和明细（映射表驱动）。

    兼容 StreamResult 和 ExecutionResult：
    - 有 text_output_tokens 时按模态拆分计费
    - 无 text_output_tokens 时将全部 output_tokens 视为文本输出（向后兼容）

    Args:
        result: StreamResult 或 ExecutionResult 对象，包含 token 统计
        agent:  Agent 对象，包含各维度费率

    Returns:
        (total_cost, metadata_dict)
    """
    # 解析模态 token（兼容无模态拆分的情况）
    image_out = getattr(result, 'image_output_tokens', 0) or 0
    text_out = getattr(result, 'text_output_tokens', 0) or (
        (getattr(result, 'output_tokens', 0) or 0) - image_out
    )

    quantities = {
        "input":        getattr(result, 'input_tokens', 0) or 0,
        "text_output":  text_out,
        "image_output": image_out,
        "search":       getattr(result, 'search_query_count', 0) or 0,
    }

    total = 0.0
    metadata = {"agent_name": getattr(agent, 'name', ''), "model": getattr(agent, 'model', '')}

    for dim_name, (agent_field, scale) in BILLING_DIMENSIONS.items():
        quantity = quantities[dim_name]
        rate = getattr(agent, agent_field, 0) or 0
        cost = quantity / scale * rate
        total += cost
        metadata[f"{dim_name}_tokens"] = quantity
        metadata[f"{dim_name}_rate"] = rate

    return total, metadata
