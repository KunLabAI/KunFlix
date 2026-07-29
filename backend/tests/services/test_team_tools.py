"""P1-5 + P1-4 unit tests: TeamEventType / TeamEventPayload / TeamToolExecutor schema."""
from __future__ import annotations

import pytest
from services.team_events import TeamEventType, TeamEventPayload, team_event
from services.team_tools import TEAM_TOOL_DEFS, TEAM_TOOL_NAMES, TeamContext


# =============================================================================
# P1-5: TeamEventType
# =============================================================================

class TestTeamEventType:
    def test_all_values_are_str(self):
        for e in TeamEventType:
            assert isinstance(e.value, str)
            assert e == e.value  # str enum

    def test_expected_members(self):
        expected = {"team_created", "team_dissolved", "worker_spawned",
                    "worker_message", "worker_completed", "worker_dismissed"}
        assert {e.value for e in TeamEventType} == expected


class TestTeamEventPayload:
    def test_to_dict_excludes_empty(self):
        p = TeamEventPayload(worker_key="W1", worker_template_type="researcher")
        d = p.to_dict()
        assert d == {"worker_key": "W1", "worker_template_type": "researcher"}
        assert "task_execution_id" not in d
        assert "message" not in d

    def test_to_dict_includes_all_when_set(self):
        p = TeamEventPayload(
            task_execution_id="te-1",
            team_name="Alpha",
            worker_key="W2",
            worker_template_type="writer",
            agent_name="Bob",
            message="hello",
            result="done",
            metadata={"x": 1},
        )
        d = p.to_dict()
        assert d["task_execution_id"] == "te-1"
        assert d["message"] == "hello"
        assert d["metadata"] == {"x": 1}


class TestTeamEventFactory:
    def test_team_event_returns_orchestration_event(self):
        ev = team_event(TeamEventType.WORKER_SPAWNED, worker_key="W1")
        assert ev.event_type == "worker_spawned"
        assert ev.data["worker_key"] == "W1"

    def test_team_event_sse_format(self):
        ev = team_event(TeamEventType.TEAM_CREATED, team_name="Beta")
        sse = ev.to_sse()
        assert "event: team_created" in sse
        assert "Beta" in sse


# =============================================================================
# P1-4: Team tool definitions
# =============================================================================

class TestTeamToolDefs:
    def test_five_tools_defined(self):
        assert len(TEAM_TOOL_DEFS) == 5

    def test_tool_names_set(self):
        assert TEAM_TOOL_NAMES == {"team_create", "worker_spawn", "worker_say", "worker_dismiss", "team_end"}

    def test_each_has_function_schema(self):
        for td in TEAM_TOOL_DEFS:
            assert td["type"] == "function"
            assert "name" in td["function"]
            assert "parameters" in td["function"]
            assert "properties" in td["function"]["parameters"]

    def test_worker_spawn_required_params(self):
        spawn = next(d for d in TEAM_TOOL_DEFS if d["function"]["name"] == "worker_spawn")
        required = spawn["function"]["parameters"]["required"]
        assert "template_type" in required
        assert "member_name" in required
        assert "task" in required


class TestTeamContext:
    def test_next_worker_key_increments(self):
        ctx = TeamContext()
        assert ctx.next_worker_key() == "W1"
        assert ctx.next_worker_key() == "W2"
        assert ctx.next_worker_key() == "W3"

    def test_default_state(self):
        ctx = TeamContext()
        assert ctx.ended is False
        assert ctx.final_result is None
        assert ctx.workers == {}
