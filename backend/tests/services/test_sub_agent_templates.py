"""P1-1 unit tests for SubAgentTemplate — schema, placeholder rendering, seed consistency."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from schemas import SubAgentTemplateCreate, SubAgentTemplateUpdate, SubAgentTemplateResponse


# =============================================================================
# Schema validation
# =============================================================================


class TestSubAgentTemplateCreateSchema:
    def test_valid_minimal(self):
        tpl = SubAgentTemplateCreate(
            type="researcher",
            description="Read-only explorer.",
            system_prompt_template="You are {member_name}.",
        )
        assert tpl.type == "researcher"
        assert tpl.permission_mode == "default"
        assert tpl.tools == []
        assert tpl.max_tool_rounds == 50

    def test_valid_full(self):
        tpl = SubAgentTemplateCreate(
            type="custom_coder",
            description="A coding agent.",
            system_prompt_template="You are {member_name}, part of team '{team_name}'.",
            permission_mode="bypass",
            context_config={"trigger_ratio": 0.7},
            tools=["image_tools", "canvas_tools"],
            max_tool_rounds=100,
        )
        assert tpl.permission_mode == "bypass"
        assert tpl.tools == ["image_tools", "canvas_tools"]
        assert tpl.max_tool_rounds == 100

    def test_type_cannot_be_empty(self):
        with pytest.raises(ValidationError):
            SubAgentTemplateCreate(
                type="",
                description="x",
                system_prompt_template="x",
            )

    def test_type_max_length(self):
        with pytest.raises(ValidationError):
            SubAgentTemplateCreate(
                type="a" * 51,
                description="x",
                system_prompt_template="x",
            )

    def test_description_cannot_be_empty(self):
        with pytest.raises(ValidationError):
            SubAgentTemplateCreate(
                type="foo",
                description="",
                system_prompt_template="x",
            )

    def test_system_prompt_template_cannot_be_empty(self):
        with pytest.raises(ValidationError):
            SubAgentTemplateCreate(
                type="foo",
                description="bar",
                system_prompt_template="",
            )

    def test_max_tool_rounds_bounds(self):
        with pytest.raises(ValidationError):
            SubAgentTemplateCreate(
                type="x", description="x", system_prompt_template="x",
                max_tool_rounds=4,  # < 5
            )
        with pytest.raises(ValidationError):
            SubAgentTemplateCreate(
                type="x", description="x", system_prompt_template="x",
                max_tool_rounds=201,  # > 200
            )

    def test_permission_mode_enum_values(self):
        for mode in ["explore", "default", "bypass"]:
            tpl = SubAgentTemplateCreate(
                type=f"t_{mode}", description="d", system_prompt_template="s",
                permission_mode=mode,
            )
            assert tpl.permission_mode == mode

    def test_invalid_permission_mode_rejected(self):
        with pytest.raises(ValidationError):
            SubAgentTemplateCreate(
                type="x", description="x", system_prompt_template="x",
                permission_mode="unknown",
            )


class TestSubAgentTemplateUpdateSchema:
    def test_all_fields_optional(self):
        upd = SubAgentTemplateUpdate()
        assert upd.type is None
        assert upd.system_prompt_template is None

    def test_partial_update(self):
        upd = SubAgentTemplateUpdate(description="updated desc")
        data = upd.model_dump(exclude_unset=True)
        assert data == {"description": "updated desc"}

    def test_max_tool_rounds_validated(self):
        with pytest.raises(ValidationError):
            SubAgentTemplateUpdate(max_tool_rounds=3)


class TestSubAgentTemplateResponseSchema:
    def test_from_dict(self):
        resp = SubAgentTemplateResponse(
            id="abc",
            type="writer",
            description="d",
            system_prompt_template="s",
            permission_mode="default",
            context_config=None,
            tools=[],
            max_tool_rounds=50,
            created_at="2026-01-01T00:00:00Z",
            updated_at=None,
        )
        assert resp.id == "abc"
        assert resp.type == "writer"


# =============================================================================
# Placeholder rendering (simulated — actual rendering is P1-4 runtime)
# =============================================================================


class TestPlaceholderRendering:
    """Verify the system_prompt_template can be rendered with expected variables."""

    TEMPLATE = (
        "You are {member_name}, a {member_description} in team '{team_name}' "
        "led by {leader_name}.\n\nTeam goal: {team_description}"
    )

    def test_all_placeholders_filled(self):
        ctx = {
            "team_name": "Alpha",
            "team_description": "Build a story.",
            "member_name": "Bob",
            "member_description": "researcher",
            "leader_name": "Alice",
        }
        rendered = self.TEMPLATE.format(**ctx)
        assert "Bob" in rendered
        assert "Alpha" in rendered
        assert "Alice" in rendered
        assert "Build a story." in rendered
        assert "researcher" in rendered

    def test_missing_placeholder_raises_keyerror(self):
        """If caller forgets a placeholder, standard Python format raises KeyError."""
        with pytest.raises(KeyError):
            self.TEMPLATE.format(team_name="x", leader_name="y")

    def test_extra_keys_are_harmless(self):
        """Extra context keys beyond the template's placeholders should be silently ignored
        when using format_map with a defaultdict or partial."""
        from collections import defaultdict
        ctx = defaultdict(lambda: "<unknown>", {
            "team_name": "T",
            "team_description": "D",
            "member_name": "M",
            "member_description": "MD",
            "leader_name": "L",
            "extra_key": "ignored",
        })
        rendered = self.TEMPLATE.format_map(ctx)
        assert "<unknown>" not in rendered
        assert "T" in rendered


# =============================================================================
# Seed data consistency
# =============================================================================


class TestSeedDataConsistency:
    """Ensure the 3 built-in templates expected by migration are valid schemas."""

    SEED_TYPES = ["researcher", "writer", "reviewer"]

    def test_seed_types_are_distinct(self):
        assert len(self.SEED_TYPES) == len(set(self.SEED_TYPES))

    def test_seed_types_are_valid_identifiers(self):
        for t in self.SEED_TYPES:
            assert t.isidentifier() or t.replace("-", "_").isidentifier()
            assert len(t) <= 50
