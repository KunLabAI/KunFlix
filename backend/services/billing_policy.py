"""P1-6: BillingPolicy —— 计费策略抽象层。

设计目标
--------
把 chat_generation.py 与 orchestrator.py 里散落的三类计费调用（预检查 /
预算校验 / 原子扣费）收敛到统一接口，让编排层只依赖 ``BillingPolicy`` 协议，
不再直接绑死 ``services.billing`` 的具体函数：

- 便于未来接入 AgentScope ``create_app`` 的 BillingMiddleware
- 便于单测里注入 fake policy，验证扣费次数 / 幂等键传递 / 异常路径
- 与既有 ``services.billing`` **完全兼容** —— 默认实现只是薄封装

约束
----
1. 幂等键必须由**调用方**（orchestrator / chat_generation）决定，policy 只透传
   （避免抽象层反噬 idempotency 语义）。
2. ``charge`` 在 ``cost <= 0`` 时视为 no-op，返回 None；不查表、不写 DB。
3. 异常语义与 ``services.billing`` 保持一致：``InsufficientCreditsError`` /
   ``BalanceFrozenError`` 由 policy **原样抛出**，不做二次转译。
4. 不承担费用**计算**（``calculate_credit_cost`` / ``calculate_video_credit_cost``
   仍在 ``services.billing`` 中，作为纯函数使用）。Policy 只承担 IO 部分。

用法
----
::

    from services.billing_policy import default_billing_policy

    await default_billing_policy.ensure_positive_balance(user_id, session)

    tx = await default_billing_policy.charge(
        user_id=user_id,
        cost=cost,
        session=session,
        metadata=meta,
        transaction_type="deduction",
        idempotency_key=f"orchestrate:{task_execution_id}",
    )
"""
from __future__ import annotations

from typing import Any, Dict, Optional, Protocol, runtime_checkable

from sqlalchemy.ext.asyncio import AsyncSession

from models import CreditTransaction
from services.billing import (
    BalanceFrozenError,
    InsufficientCreditsError,
    check_balance_sufficient,
    deduct_credits_atomic,
    require_positive_balance,
)


# ---------------------------------------------------------------------------
# Protocol
# ---------------------------------------------------------------------------


@runtime_checkable
class BillingPolicy(Protocol):
    """Billing operations required by chat / orchestration flows.

    结构类型（Protocol）而非抽象基类，便于用测试 stub 或未来 middleware 替换。
    """

    async def ensure_positive_balance(
        self,
        user_id: str,
        session: AsyncSession,
    ) -> None:
        """严格余额检查：余额 <= 0 或账户冻结 → 抛异常。

        Raises:
            InsufficientCreditsError
            BalanceFrozenError
        """
        ...

    async def check_estimated_cost(
        self,
        user_id: str,
        estimated_cost: float,
        session: AsyncSession,
    ) -> bool:
        """预算校验：余额是否足以承担 ``estimated_cost``。

        账户冻结时抛 ``BalanceFrozenError``。
        """
        ...

    async def charge(
        self,
        user_id: str,
        cost: float,
        session: AsyncSession,
        *,
        metadata: Dict[str, Any],
        transaction_type: str,
        idempotency_key: str,
    ) -> Optional[CreditTransaction]:
        """原子扣费。``cost <= 0`` 时视为 no-op 返回 None，不写库。

        Raises:
            InsufficientCreditsError
            BalanceFrozenError
        """
        ...


# ---------------------------------------------------------------------------
# Default implementation —— 薄封装 services.billing
# ---------------------------------------------------------------------------


class KunFlixBillingPolicy:
    """默认 policy 实现：委托到既有 ``services.billing`` 函数。

    - 保持所有 idempotency_key / metadata / transaction_type 原样透传
    - 不改变 CreditTransaction 表结构
    - ``ensure_positive_balance`` / ``check_estimated_cost`` / ``charge`` 与
      ``require_positive_balance`` / ``check_balance_sufficient`` /
      ``deduct_credits_atomic`` 一一对应
    """

    async def ensure_positive_balance(
        self,
        user_id: str,
        session: AsyncSession,
    ) -> None:
        await require_positive_balance(user_id, session)

    async def check_estimated_cost(
        self,
        user_id: str,
        estimated_cost: float,
        session: AsyncSession,
    ) -> bool:
        return await check_balance_sufficient(user_id, estimated_cost, session)

    async def charge(
        self,
        user_id: str,
        cost: float,
        session: AsyncSession,
        *,
        metadata: Dict[str, Any],
        transaction_type: str,
        idempotency_key: str,
    ) -> Optional[CreditTransaction]:
        # cost <= 0 视为 no-op；避免生成幽灵 CreditTransaction 行
        if cost <= 0:
            return None
        return await deduct_credits_atomic(
            user_id=user_id,
            cost=cost,
            session=session,
            metadata=metadata,
            transaction_type=transaction_type,
            idempotency_key=idempotency_key,
        )


# ---------------------------------------------------------------------------
# Module-level default singleton
# ---------------------------------------------------------------------------
#
# 未来通过 ``set_default_billing_policy`` 可以在应用启动时注入自定义实现
# （例如 AgentScope create_app 场景下的 BillingMiddleware）。默认场景无需触碰。

_default_billing_policy: BillingPolicy = KunFlixBillingPolicy()


def get_default_billing_policy() -> BillingPolicy:
    """获取当前默认 BillingPolicy 单例。"""
    return _default_billing_policy


def set_default_billing_policy(policy: BillingPolicy) -> None:
    """替换默认 BillingPolicy 单例（app startup 或测试时使用）。"""
    global _default_billing_policy
    _default_billing_policy = policy


# 为方便 orchestrator / chat_generation 直接 ``from services.billing_policy import default_billing_policy``
# 提供一个模块级别的 property-like 访问。使用时**不要**直接持有该引用（会绑定当前实现），
# 优先通过 ``get_default_billing_policy()`` 获取，以支持运行时替换。
default_billing_policy = _default_billing_policy


__all__ = [
    "BillingPolicy",
    "KunFlixBillingPolicy",
    "default_billing_policy",
    "get_default_billing_policy",
    "set_default_billing_policy",
    # re-export for callers that only import this module
    "InsufficientCreditsError",
    "BalanceFrozenError",
]
