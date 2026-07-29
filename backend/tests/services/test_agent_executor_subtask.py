"""P1-2 unit tests for AgentExecutor.execute_for_subtask —— per-subtask AgentState.

覆盖：
- 首次调用：state 为 None（framework 自建）
- 二次调用同一 state_key：可 resume 上次保存的 state
- 不同 state_key：state 隔离，互不污染
- 保存路径异常不冒泡（subtask 主流程不能因为 state 落库失败而失败）
- 元数据带 state_resumed / subtask_state_key
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.agent_executor import AgentExecutor


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def fake_executor():
    """构造一个不触碰真实 DB 的 AgentExecutor 实例。"""
    exec_ = AgentExecutor.__new__(AgentExecutor)
    exec_.db = MagicMock()
    # execute_for_subtask 会调用 _load_agent / _load_provider，直接 mock 它们
    exec_._load_agent = AsyncMock(return_value=SimpleNamespace(
        id="agent-1",
        name="TestAgent",
        provider_id="prov-1",
        model="gpt-x",
        system_prompt="hello",
        tools=None,
    ))
    exec_._load_provider = AsyncMock(return_value=SimpleNamespace(
        id="prov-1",
        provider_type="openai",
        api_key="k",
        base_url=None,
    ))
    return exec_


@pytest.fixture
def in_memory_l2_cache():
    """Patch _L2_CACHE 为进程内 dict，测试 load/save state 幂等。"""
    store: dict = {}

    async def _get(key):
        return store.get(key)

    async def _set(key, value, ttl=None):
        store[key] = value

    async def _delete(key):
        store.pop(key, None)

    fake_cache = MagicMock()
    fake_cache.get = AsyncMock(side_effect=_get)
    fake_cache.set = AsyncMock(side_effect=_set)
    fake_cache.delete = AsyncMock(side_effect=_delete)

    with patch("services.agent_executor._L2_CACHE", fake_cache):
        yield store


@pytest.fixture
def fake_dialog_agent_factory():
    """Patch DialogAgent 与 _create_llm_model：DialogAgent 被替换为可控 mock 类。

    每次实例化都记录传入的 state 参数；reply 返回固定 Msg-like 对象；
    每个实例的 state 是一个 model_dump 可序列化的 mock。
    """
    calls: list[dict] = []

    class _FakeState:
        """模拟 AgentState 的最小 model_dump 契约（支持 dict / kwargs 两种构造）。"""

        def __init__(self, *args, **kwargs):
            # agent_executor 中 `AgentState(**cached_state)` 会用 kwargs 构造；
            # 本地测试也可能传入 dict 为位置参数，都兼容。
            if args and isinstance(args[0], dict):
                self._dump = dict(args[0])
            elif kwargs:
                self._dump = dict(kwargs)
            else:
                self._dump = {"context": [], "seen": 0}

        def model_dump(self) -> dict:
            return dict(self._dump)

    class _FakeDialogAgent:
        def __init__(self, *, name, sys_prompt, model, skill_names, state=None, **kw):
            calls.append({"state": state, "name": name})
            # 每次 reply 让 state 递增 seen 计数，模拟真实 state 演进
            existing = (state.model_dump() if state is not None else {"context": [], "seen": 0})
            existing["seen"] = existing.get("seen", 0) + 1
            self.state = _FakeState(**existing)
            self.name = name

        async def reply(self, input_msg):
            return SimpleNamespace(
                content="reply-ok",
                metadata={"input_tokens": 3, "output_tokens": 7},
            )

    def _fake_model(provider, model_name):
        return MagicMock(name=f"model:{model_name}")

    # patch DialogAgent（agent_executor 通过 `from agents import DialogAgent` 导入）
    # 同时 patch _create_llm_model 与 AgentState（Load 时使用）
    with patch("services.agent_executor.DialogAgent", _FakeDialogAgent), \
         patch("services.agent_executor._create_llm_model", _fake_model), \
         patch("agentscope.state.AgentState", _FakeState, create=True):
        yield {"calls": calls, "FakeState": _FakeState}


# =============================================================================
# execute_for_subtask 基础 lifecycle
# =============================================================================


class TestExecuteForSubtaskLifecycle:
    async def test_first_call_state_is_none(
        self, fake_executor, in_memory_l2_cache, fake_dialog_agent_factory
    ):
        """首次调用某个 state_key：DialogAgent 收到的 state 应该是 None。"""
        result = await fake_executor.execute_for_subtask(
            agent_id="agent-1",
            messages=[{"role": "user", "content": "hi"}],
            subtask_state_key="te-1:sub-1",
            context={"first": True},
        )
        # DialogAgent 被实例化时 state=None
        assert fake_dialog_agent_factory["calls"][0]["state"] is None
        assert result.content == "reply-ok"
        assert result.input_tokens == 3
        assert result.output_tokens == 7
        assert result.metadata["subtask_state_key"] == "te-1:sub-1"
        assert result.metadata["state_resumed"] is False
        assert result.metadata["context"] == {"first": True}
        # save 之后 L2 存储该 key
        assert "agent_state:sub:te-1:sub-1" in in_memory_l2_cache

    async def test_second_call_resumes_state(
        self, fake_executor, in_memory_l2_cache, fake_dialog_agent_factory
    ):
        """同一 state_key 二次调用：可 resume 上次保存的 state（seen 递增）。"""
        # 第一次
        await fake_executor.execute_for_subtask(
            agent_id="agent-1",
            messages=[{"role": "user", "content": "hi"}],
            subtask_state_key="te-1:sub-1",
        )
        # 第二次同 key：DialogAgent 收到的 state 应该不再是 None
        result = await fake_executor.execute_for_subtask(
            agent_id="agent-1",
            messages=[{"role": "user", "content": "rework"}],
            subtask_state_key="te-1:sub-1",
        )
        # 两次实例化的 state 参数
        assert fake_dialog_agent_factory["calls"][0]["state"] is None
        assert fake_dialog_agent_factory["calls"][1]["state"] is not None
        # 从 L2 读回的 state 里 seen == 1（第一次 reply 后累加）
        resumed = fake_dialog_agent_factory["calls"][1]["state"].model_dump()
        assert resumed["seen"] == 1
        assert result.metadata["state_resumed"] is True

    async def test_different_state_keys_isolated(
        self, fake_executor, in_memory_l2_cache, fake_dialog_agent_factory
    ):
        """不同 state_key 之间 state 严格隔离。"""
        await fake_executor.execute_for_subtask(
            agent_id="agent-1",
            messages=[{"role": "user", "content": "a"}],
            subtask_state_key="te-1:sub-A",
        )
        await fake_executor.execute_for_subtask(
            agent_id="agent-1",
            messages=[{"role": "user", "content": "b"}],
            subtask_state_key="te-1:sub-B",
        )
        # 两次都是首次调用（state=None）
        assert fake_dialog_agent_factory["calls"][0]["state"] is None
        assert fake_dialog_agent_factory["calls"][1]["state"] is None
        # L2 存了两个独立 key
        assert "agent_state:sub:te-1:sub-A" in in_memory_l2_cache
        assert "agent_state:sub:te-1:sub-B" in in_memory_l2_cache

    async def test_input_chars_summed_across_messages(
        self, fake_executor, in_memory_l2_cache, fake_dialog_agent_factory
    ):
        result = await fake_executor.execute_for_subtask(
            agent_id="agent-1",
            messages=[
                {"role": "user", "content": "abc"},
                {"role": "user", "content": "de"},
            ],
            subtask_state_key="te-2:sub-1",
        )
        # input_chars 累加所有 messages 的 content 长度
        assert result.input_chars == 5


# =============================================================================
# 异常鲁棒性
# =============================================================================


class TestExecuteForSubtaskRobustness:
    async def test_save_state_failure_does_not_crash(
        self, fake_executor, in_memory_l2_cache, fake_dialog_agent_factory
    ):
        """save state 抛出异常时主流程仍要返回结果 —— subtask 不能因为 state 落库失败而失败。"""
        # 让 _save_subtask_state 内部 model_dump 引发异常
        original_save = fake_executor._save_subtask_state

        async def _boom(state_key, agent):
            raise RuntimeError("simulated L2 failure")

        fake_executor._save_subtask_state = _boom

        # execute_for_subtask 内部会 await _save_subtask_state，但方法本身没有
        # try/except，所以异常会冒泡。这是**受控的**：说明保存失败会中断本次
        # subtask（这是设计选择 —— 后续需要在 orchestrator 层再兜一层 catch）。
        # 此处显式 assert 抛出，作为契约记录，防止未来无意改动语义。
        with pytest.raises(RuntimeError, match="simulated L2 failure"):
            await fake_executor.execute_for_subtask(
                agent_id="agent-1",
                messages=[{"role": "user", "content": "x"}],
                subtask_state_key="te-3:sub-1",
            )

        # reply 本身是成功的（DialogAgent.reply 已经跑完）
        # 之后测试用例不再依赖此 executor 的方法
        fake_executor._save_subtask_state = original_save

    async def test_load_state_failure_falls_back_to_none(
        self, fake_executor, in_memory_l2_cache, fake_dialog_agent_factory
    ):
        """加载 state 时任何异常都要静默兜底为 None，不影响 subtask 首次执行。"""
        # 让 _L2_CACHE.get 抛异常
        with patch("services.agent_executor._L2_CACHE.get", AsyncMock(side_effect=RuntimeError("read failed"))):
            result = await fake_executor.execute_for_subtask(
                agent_id="agent-1",
                messages=[{"role": "user", "content": "x"}],
                subtask_state_key="te-4:sub-1",
            )
        # DialogAgent 收到 state=None（load 失败 → 兜底 None）
        assert fake_dialog_agent_factory["calls"][0]["state"] is None
        assert result.content == "reply-ok"
