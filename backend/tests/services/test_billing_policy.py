"""P1-6 unit tests for services.billing_policy —— 计费策略抽象。

覆盖：
- ``KunFlixBillingPolicy`` 三个方法正确委托到 services.billing 底层函数
- ``charge(cost <= 0)`` no-op 语义（不调用 deduct_credits_atomic）
- 异常（InsufficientCreditsError / BalanceFrozenError）从底层原样抛出
- idempotency_key / metadata / transaction_type 完整透传
- Protocol runtime_checkable 语义
- ``set_default_billing_policy`` / ``get_default_billing_policy`` 生命周期

不触真实 DB —— services.billing 的三个 IO 函数用 AsyncMock 打桩。
"""
from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.billing_policy import (
    BillingPolicy,
    KunFlixBillingPolicy,
    default_billing_policy,
    get_default_billing_policy,
    set_default_billing_policy,
)
from services.billing import (
    BalanceFrozenError,
    InsufficientCreditsError,
)


# =============================================================================
# Protocol conformance
# =============================================================================


class TestProtocolConformance:
    def test_kunflix_policy_is_billing_policy(self):
        # runtime_checkable Protocol —— isinstance 检查应通过
        assert isinstance(KunFlixBillingPolicy(), BillingPolicy)

    def test_module_default_is_kunflix_policy(self):
        assert isinstance(default_billing_policy, KunFlixBillingPolicy)

    def test_get_default_returns_kunflix_policy(self):
        assert isinstance(get_default_billing_policy(), KunFlixBillingPolicy)


# =============================================================================
# KunFlixBillingPolicy.ensure_positive_balance
# =============================================================================


class TestEnsurePositiveBalance:
    async def test_delegates_to_require_positive_balance(self):
        policy = KunFlixBillingPolicy()
        session = MagicMock()
        with patch(
            "services.billing_policy.require_positive_balance",
            new_callable=AsyncMock,
        ) as mock_require:
            await policy.ensure_positive_balance("user-1", session)
            mock_require.assert_awaited_once_with("user-1", session)

    async def test_insufficient_credits_propagates(self):
        policy = KunFlixBillingPolicy()
        session = MagicMock()
        with patch(
            "services.billing_policy.require_positive_balance",
            new_callable=AsyncMock,
            side_effect=InsufficientCreditsError("empty"),
        ):
            with pytest.raises(InsufficientCreditsError, match="empty"):
                await policy.ensure_positive_balance("user-1", session)

    async def test_balance_frozen_propagates(self):
        policy = KunFlixBillingPolicy()
        session = MagicMock()
        with patch(
            "services.billing_policy.require_positive_balance",
            new_callable=AsyncMock,
            side_effect=BalanceFrozenError("frozen"),
        ):
            with pytest.raises(BalanceFrozenError, match="frozen"):
                await policy.ensure_positive_balance("user-1", session)


# =============================================================================
# KunFlixBillingPolicy.check_estimated_cost
# =============================================================================


class TestCheckEstimatedCost:
    async def test_delegates_and_returns_true(self):
        policy = KunFlixBillingPolicy()
        session = MagicMock()
        with patch(
            "services.billing_policy.check_balance_sufficient",
            new_callable=AsyncMock,
            return_value=True,
        ) as mock_check:
            result = await policy.check_estimated_cost("user-1", 12.5, session)
            assert result is True
            mock_check.assert_awaited_once_with("user-1", 12.5, session)

    async def test_delegates_and_returns_false(self):
        policy = KunFlixBillingPolicy()
        session = MagicMock()
        with patch(
            "services.billing_policy.check_balance_sufficient",
            new_callable=AsyncMock,
            return_value=False,
        ):
            result = await policy.check_estimated_cost("user-1", 100.0, session)
            assert result is False

    async def test_frozen_propagates(self):
        policy = KunFlixBillingPolicy()
        session = MagicMock()
        with patch(
            "services.billing_policy.check_balance_sufficient",
            new_callable=AsyncMock,
            side_effect=BalanceFrozenError("frozen"),
        ):
            with pytest.raises(BalanceFrozenError):
                await policy.check_estimated_cost("user-1", 1.0, session)


# =============================================================================
# KunFlixBillingPolicy.charge
# =============================================================================


class TestCharge:
    async def test_zero_cost_is_noop(self):
        """cost == 0 不能触发 deduct_credits_atomic，返回 None。"""
        policy = KunFlixBillingPolicy()
        session = MagicMock()
        with patch(
            "services.billing_policy.deduct_credits_atomic",
            new_callable=AsyncMock,
        ) as mock_deduct:
            tx = await policy.charge(
                user_id="user-1",
                cost=0.0,
                session=session,
                metadata={},
                transaction_type="deduction",
                idempotency_key="test:1",
            )
            assert tx is None
            mock_deduct.assert_not_awaited()

    async def test_negative_cost_is_noop(self):
        """cost < 0 也视为 no-op（保护性设计，避免负数扣费）。"""
        policy = KunFlixBillingPolicy()
        session = MagicMock()
        with patch(
            "services.billing_policy.deduct_credits_atomic",
            new_callable=AsyncMock,
        ) as mock_deduct:
            tx = await policy.charge(
                user_id="user-1",
                cost=-1.0,
                session=session,
                metadata={},
                transaction_type="deduction",
                idempotency_key="test:2",
            )
            assert tx is None
            mock_deduct.assert_not_awaited()

    async def test_positive_cost_delegates(self):
        """cost > 0 委托到 deduct_credits_atomic，返回其结果。"""
        policy = KunFlixBillingPolicy()
        session = MagicMock()
        fake_tx = MagicMock(id="tx-1", balance_after=90.0)
        with patch(
            "services.billing_policy.deduct_credits_atomic",
            new_callable=AsyncMock,
            return_value=fake_tx,
        ) as mock_deduct:
            tx = await policy.charge(
                user_id="user-1",
                cost=10.5,
                session=session,
                metadata={"foo": "bar"},
                transaction_type="deduction",
                idempotency_key="orchestrate:te-1",
            )
            assert tx is fake_tx
            # 参数完整透传
            mock_deduct.assert_awaited_once_with(
                user_id="user-1",
                cost=10.5,
                session=session,
                metadata={"foo": "bar"},
                transaction_type="deduction",
                idempotency_key="orchestrate:te-1",
            )

    async def test_insufficient_propagates(self):
        policy = KunFlixBillingPolicy()
        session = MagicMock()
        with patch(
            "services.billing_policy.deduct_credits_atomic",
            new_callable=AsyncMock,
            side_effect=InsufficientCreditsError("no money"),
        ):
            with pytest.raises(InsufficientCreditsError):
                await policy.charge(
                    user_id="user-1",
                    cost=1.0,
                    session=session,
                    metadata={},
                    transaction_type="deduction",
                    idempotency_key="k",
                )

    async def test_frozen_propagates(self):
        policy = KunFlixBillingPolicy()
        session = MagicMock()
        with patch(
            "services.billing_policy.deduct_credits_atomic",
            new_callable=AsyncMock,
            side_effect=BalanceFrozenError("frozen"),
        ):
            with pytest.raises(BalanceFrozenError):
                await policy.charge(
                    user_id="user-1",
                    cost=1.0,
                    session=session,
                    metadata={},
                    transaction_type="deduction",
                    idempotency_key="k",
                )

    async def test_idempotency_key_transparently_passed(self):
        """幂等键必须原样透传 —— 这是 P1-6 契约的核心保障。"""
        policy = KunFlixBillingPolicy()
        session = MagicMock()
        with patch(
            "services.billing_policy.deduct_credits_atomic",
            new_callable=AsyncMock,
            return_value=None,
        ) as mock_deduct:
            await policy.charge(
                user_id="u",
                cost=1.0,
                session=session,
                metadata={},
                transaction_type="deduction",
                idempotency_key="orchestrate:e2e2e2",
            )
            call_kwargs = mock_deduct.await_args.kwargs
            assert call_kwargs["idempotency_key"] == "orchestrate:e2e2e2"


# =============================================================================
# Default policy lifecycle
# =============================================================================


class TestDefaultPolicyLifecycle:
    def test_set_and_get_default(self):
        """set_default_billing_policy 应改变后续 get_default_billing_policy 返回值。"""

        class _Fake:
            async def ensure_positive_balance(self, *a, **kw):
                return None

            async def check_estimated_cost(self, *a, **kw):
                return True

            async def charge(self, *a, **kw):
                return None

        original = get_default_billing_policy()
        try:
            fake = _Fake()
            set_default_billing_policy(fake)
            assert get_default_billing_policy() is fake
        finally:
            # 恢复默认，避免污染其他用例
            set_default_billing_policy(original)

    def test_get_default_is_stable_across_calls(self):
        a = get_default_billing_policy()
        b = get_default_billing_policy()
        assert a is b


# =============================================================================
# Structural typing —— fake policy 可替代默认实现
# =============================================================================


class TestStructuralSubstitution:
    """验证 orchestrator / chat_generation 可以注入任意结构兼容的 policy。"""

    async def test_stub_policy_can_replace_default(self):
        """一个纯 mock 对象只要方法签名匹配即可用作 BillingPolicy。"""
        call_log: list[dict[str, Any]] = []

        class _StubPolicy:
            async def ensure_positive_balance(self, user_id, session):
                call_log.append({"op": "ensure", "user": user_id})

            async def check_estimated_cost(self, user_id, estimated_cost, session):
                call_log.append({"op": "check", "user": user_id, "cost": estimated_cost})
                return True

            async def charge(self, user_id, cost, session, *, metadata, transaction_type, idempotency_key):
                call_log.append({
                    "op": "charge",
                    "user": user_id,
                    "cost": cost,
                    "idempotency_key": idempotency_key,
                })
                return None

        stub = _StubPolicy()
        assert isinstance(stub, BillingPolicy)  # runtime_checkable Protocol
        session = MagicMock()
        await stub.ensure_positive_balance("u", session)
        await stub.check_estimated_cost("u", 5.0, session)
        await stub.charge(
            user_id="u",
            cost=3.0,
            session=session,
            metadata={},
            transaction_type="deduction",
            idempotency_key="k",
        )
        assert [c["op"] for c in call_log] == ["ensure", "check", "charge"]
        assert call_log[2]["idempotency_key"] == "k"
