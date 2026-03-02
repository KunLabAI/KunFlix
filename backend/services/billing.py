"""
多维度积分计费计算器 - 映射表驱动，避免 if 分支
"""
from typing import Dict, Tuple, Optional
from sqlalchemy import update, select
from sqlalchemy.ext.asyncio import AsyncSession
from decimal import Decimal
import logging
from models import User, CreditTransaction

logger = logging.getLogger(__name__)

# 计费维度映射表：dim_name -> (Agent 费率字段, scale)
# scale=1_000_000 表示每 1M tokens 计费，scale=1 表示每次计费
BILLING_DIMENSIONS = {
    "input":        ("input_credit_per_1m",         1_000_000),
    "text_output":  ("output_credit_per_1m",        1_000_000),
    "image_output": ("image_output_credit_per_1m",  1_000_000),
    "search":       ("search_credit_per_query",     1),
}

class InsufficientCreditsError(Exception):
    """用户积分不足异常"""
    pass

async def check_balance_sufficient(user_id: str, estimated_cost: float, session: AsyncSession) -> bool:
    """
    检查用户余额是否足够支付预估费用。
    
    Args:
        user_id: 用户ID
        estimated_cost: 预估费用
        session: 数据库会话
        
    Returns:
        bool: 是否足够
    """
    stmt = select(User.credits).where(User.id == user_id)
    result = await session.execute(stmt)
    current_balance = result.scalar() or Decimal('0.0')
    
    # 转换为 Decimal 进行比较
    cost_decimal = Decimal(str(estimated_cost))
    
    if current_balance < cost_decimal:
        return False
    return True

async def deduct_credits_atomic(
    user_id: str, 
    cost: float, 
    session: AsyncSession, 
    metadata: Dict = None,
    transaction_type: str = "consumption"
) -> CreditTransaction:
    """
    原子扣除用户积分。
    使用 UPDATE ... WHERE ... 语句确保并发安全。
    
    Args:
        user_id: 用户ID
        cost: 扣除金额 (必须 >= 0)
        session: 数据库会话
        metadata: 交易元数据
        transaction_type: 交易类型
        
    Returns:
        CreditTransaction: 创建的交易记录
        
    Raises:
        InsufficientCreditsError: 余额不足
        ValueError: 扣除金额无效
    """
    if cost < 0:
        raise ValueError("Cost cannot be negative")
        
    if cost == 0:
        # 如果费用为0，仅记录交易但不扣费（或者直接返回）
        # 这里选择记录以便追踪零成本调用
        pass

    cost_decimal = Decimal(str(cost))
    
    # 1. 原子更新余额
    # UPDATE users SET credits = credits - :cost WHERE id = :id AND credits >= :cost
    stmt = (
        update(User)
        .where(User.id == user_id)
        .where(User.credits >= cost_decimal)
        .values(credits=User.credits - cost_decimal)
        .execution_options(synchronize_session="fetch")
    )
    
    result = await session.execute(stmt)
    
    if result.rowcount == 0:
        # 更新失败，可能是余额不足或用户不存在
        # 再次检查用户是否存在
        user_exists = await session.execute(select(User.id).where(User.id == user_id))
        if not user_exists.scalar():
            raise ValueError(f"User {user_id} not found")
        
        # 既然用户存在，那就是余额不足
        logger.warning(f"Insufficient credits for user {user_id}. Cost: {cost}")
        raise InsufficientCreditsError(f"Insufficient credits. Required: {cost}")
    
    # 2. 获取更新后的余额（用于记录交易）
    # 注意：在高并发下，再次查询的余额可能已经发生变化，
    # 但对于交易记录来说，我们更关心的是"这次扣除前的余额"和"扣除量"。
    # balance_after = balance_before - cost
    # 为了准确记录，我们可以重新查询当前余额。
    # 或者，我们接受 transaction log 中的 balance 是近似值，只要总额对得上。
    # 更严谨的做法是利用 RETURNING 子句 (PostgreSQL/Oracle)，但 SQLite/MySQL 旧版不支持。
    # 这里我们再查一次，虽然可能包含其他并发事务的影响，但在审计上是可以接受的。
    
    balance_stmt = select(User.credits).where(User.id == user_id)
    balance_result = await session.execute(balance_stmt)
    current_balance = balance_result.scalar()
    
    # 推算扣除前的余额 (仅供参考)
    balance_before = current_balance + cost_decimal
    
    # 3. 创建交易记录
    transaction = CreditTransaction(
        user_id=user_id,
        amount=-cost_decimal,  # 支出为负
        balance_before=balance_before,
        balance_after=current_balance,
        transaction_type=transaction_type,
        metadata_json=metadata or {}
    )
    session.add(transaction)
    
    return transaction

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
