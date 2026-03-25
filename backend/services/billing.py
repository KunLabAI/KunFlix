"""
多维度积分计费计算器 - 映射表驱动，避免 if 分支
"""
from typing import Dict, Tuple, Optional
from sqlalchemy import update, select
from sqlalchemy.ext.asyncio import AsyncSession
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

# 视频计费维度映射表：dim_name -> scale
# scale=1 表示每单位（张/秒）计费，费率从 provider.model_costs[model] 字典中按 dim_name 读取
VIDEO_BILLING_DIMENSIONS = {
    "video_input_image":  1,  # 每张输入图片
    "video_input_second": 1,  # 每秒输入视频(edit)
    "video_output_480p":  1,  # 每秒480p输出
    "video_output_720p":  1,  # 每秒720p输出
}

# 视频质量 -> 输出计费维度映射（避免 if-else）
QUALITY_BILLING_FIELD = {
    "480p": "video_output_480p",
    "720p": "video_output_720p",
}

class InsufficientCreditsError(Exception):
    """用户积分不足异常"""
    pass

class BalanceFrozenError(Exception):
    """用户资金已冻结异常"""
    pass

async def check_balance_sufficient(user_id: str, estimated_cost: float, session: AsyncSession) -> bool:
    """
    检查用户余额是否足够支付预估费用，并检查是否冻结。
    
    Args:
        user_id: 用户ID
        estimated_cost: 预估费用
        session: 数据库会话
        
    Returns:
        bool: 是否足够
        
    Raises:
        BalanceFrozenError: 如果账户被冻结
    """
    # 1. 尝试查询用户
    stmt = select(User.credits, User.is_balance_frozen).where(User.id == user_id)
    result = await session.execute(stmt)
    row = result.first()
    
    if row:
        current_balance = float(row.credits or 0)
        is_frozen = row.is_balance_frozen or False
        
        if is_frozen:
            raise BalanceFrozenError(f"User {user_id} balance is frozen")
        
        return current_balance >= estimated_cost

    # 2. 尝试查询管理员
    from models import Admin
    stmt_admin = select(Admin.credits).where(Admin.id == user_id)
    result_admin = await session.execute(stmt_admin)
    row_admin = result_admin.first()
    
    if row_admin:
        current_balance = float(row_admin.credits or 0)
        return current_balance >= estimated_cost

    return False

async def refund_credits_atomic(
    user_id: str,
    amount: float,
    session: AsyncSession,
    metadata: Dict = None,
    description: str = "Refund"
) -> CreditTransaction:
    """
    原子退还用户积分。
    
    Args:
        user_id: 用户ID
        amount: 退还金额 (必须 >= 0)
        session: 数据库会话
        metadata: 交易元数据
        description: 描述
        
    Returns:
        CreditTransaction: 交易记录
    """
    if amount < 0:
        raise ValueError("Refund amount cannot be negative")
    
    if amount == 0:
        pass

    amount_float = float(amount)
    
    # 1. 原子增加余额 (User)
    # UPDATE users SET credits = credits + :amount WHERE id = :id
    stmt = (
        update(User)
        .where(User.id == user_id)
        .values(credits=User.credits + amount_float)
        .execution_options(synchronize_session="fetch")
    )
    
    result = await session.execute(stmt)
    
    if result.rowcount == 0:
        # 尝试增加 Admin 余额
        from models import Admin
        stmt_admin = (
            update(Admin)
            .where(Admin.id == user_id)
            .values(credits=Admin.credits + amount_float)
            .execution_options(synchronize_session="fetch")
        )
        result_admin = await session.execute(stmt_admin)
        
        if result_admin.rowcount > 0:
             balance_stmt = select(Admin.credits).where(Admin.id == user_id)
             balance_result = await session.execute(balance_stmt)
             current_balance = float(balance_result.scalar() or 0)
             balance_before = current_balance - amount_float
             
             transaction = CreditTransaction(
                admin_id=user_id,
                amount=amount_float,
                balance_before=balance_before,
                balance_after=current_balance,
                transaction_type="refund",
                metadata_json=metadata or {},
                description=description
            )
             session.add(transaction)
             return transaction
             
        raise ValueError(f"User/Admin {user_id} not found")
        
    # 2. 获取更新后的余额 (User)
    balance_stmt = select(User.credits).where(User.id == user_id)
    balance_result = await session.execute(balance_stmt)
    current_balance = float(balance_result.scalar() or 0)
    
    # 推算退还前的余额
    balance_before = current_balance - amount_float
    
    # 3. 创建交易记录
    transaction = CreditTransaction(
        user_id=user_id,
        amount=amount_float,  # 收入为正
        balance_before=balance_before,
        balance_after=current_balance,
        transaction_type="refund",
        metadata_json=metadata or {},
        description=description
    )
    session.add(transaction)
    
    return transaction

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

    cost_float = float(cost)
    
    # 1. 原子更新余额
    # UPDATE users SET credits = credits - :cost WHERE id = :id AND credits >= :cost AND is_balance_frozen = False
    
    # Try updating User table first
    stmt = (
        update(User)
        .where(User.id == user_id)
        .where(User.credits >= cost_float)
        .where(User.is_balance_frozen == False)  # 确保未冻结
        .values(credits=User.credits - cost_float)
        .execution_options(synchronize_session="fetch")
    )
    
    result = await session.execute(stmt)
    
    if result.rowcount == 0:
        # Check if it is an Admin
        from models import Admin
        stmt_admin = (
            update(Admin)
            .where(Admin.id == user_id)
            .where(Admin.credits >= cost_float)
            .values(credits=Admin.credits - cost_float)
            .execution_options(synchronize_session="fetch")
        )
        result_admin = await session.execute(stmt_admin)
        
        if result_admin.rowcount > 0:
             # It was an admin, and update succeeded
             balance_stmt = select(Admin.credits).where(Admin.id == user_id)
             balance_result = await session.execute(balance_stmt)
             current_balance = float(balance_result.scalar() or 0)
             balance_before = current_balance + cost_float
             
             transaction = CreditTransaction(
                admin_id=user_id,  # Use admin_id column
                amount=-cost_float,
                balance_before=balance_before,
                balance_after=current_balance,
                transaction_type=transaction_type,
                metadata_json=metadata or {}
            )
             session.add(transaction)
             return transaction

        # Update failed, check reasons (User or Admin)
        # Check User first
        stmt_check = select(User.credits, User.is_balance_frozen).where(User.id == user_id)
        res_check = await session.execute(stmt_check)
        row = res_check.first()
        
        if row:
             if row.is_balance_frozen:
                 raise BalanceFrozenError(f"User {user_id} balance is frozen")
             if float(row.credits or 0) < cost_float:
                logger.warning(f"Insufficient credits for user {user_id}. Cost: {cost}")
                raise InsufficientCreditsError(f"Insufficient credits. Required: {cost}")
        
        # Check Admin
        stmt_check_admin = select(Admin.credits).where(Admin.id == user_id)
        res_check_admin = await session.execute(stmt_check_admin)
        row_admin = res_check_admin.first()
        
        if row_admin:
             if float(row_admin.credits or 0) < cost_float:
                logger.warning(f"Insufficient credits for admin {user_id}. Cost: {cost}")
                raise InsufficientCreditsError(f"Insufficient credits. Required: {cost}")
             # Add check for update failure even with sufficient credits
             raise Exception("Failed to deduct credits for admin (unknown reason)")
        
        if not row and not row_admin:
            raise ValueError(f"User/Admin {user_id} not found")
            
        # 其他未知原因
        raise Exception("Failed to deduct credits (unknown reason)")
    
    # 2. 获取更新后的余额（User）
    balance_stmt = select(User.credits).where(User.id == user_id)
    balance_result = await session.execute(balance_stmt)
    current_balance = float(balance_result.scalar() or 0)
    
    # 推算扣除前的余额 (仅供参考)
    balance_before = current_balance + cost_float
    
    # 3. 创建交易记录
    transaction = CreditTransaction(
        user_id=user_id,
        amount=-cost_float,  # 支出为负
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


def calculate_video_credit_cost(task, rate_map: Dict) -> Tuple[float, Dict]:
    """
    视频任务积分计费（映射表驱动）。

    Args:
        task:     VideoTask 对象，包含 input_image_count, output_duration_seconds, quality
        rate_map: provider.model_costs[model] 字典，dim_name -> rate

    Returns:
        (total_cost, metadata_dict)
    """
    output_dim = QUALITY_BILLING_FIELD.get(task.quality, "video_output_720p")

    quantities = {
        "video_input_image":  getattr(task, 'input_image_count', 0) or 0,
        "video_input_second": 0,  # edit 模式才有输入视频时长
        "video_output_480p":  task.output_duration_seconds if output_dim == "video_output_480p" else 0,
        "video_output_720p":  task.output_duration_seconds if output_dim == "video_output_720p" else 0,
    }

    total = 0.0
    metadata = {
        "video_mode": getattr(task, 'video_mode', ''),
        "quality": getattr(task, 'quality', ''),
    }

    for dim_name, scale in VIDEO_BILLING_DIMENSIONS.items():
        quantity = quantities[dim_name]
        rate = rate_map.get(dim_name, 0) or 0
        cost = quantity / scale * rate
        total += cost
        metadata[f"{dim_name}_quantity"] = quantity
        metadata[f"{dim_name}_rate"] = rate

    return total, metadata
