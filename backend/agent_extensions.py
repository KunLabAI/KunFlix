import logging
from typing import Any, Dict, Callable
from agentscope.message import Msg

logger = logging.getLogger(__name__)

class ToolGuardMixin:
    """
    Mixin for ReActAgent to intercept tool calls before execution.
    Implements a simplified deny/guard/approve flow for phase 1.
    """
    
    def _init_tool_guard(self):
        """Initialize tool guard rules and state."""
        self._denied_tools = {"execute_shell_command", "delete_file"}
        self._guarded_tools = {"write_file", "edit_file"}
        self._pending_approvals = {}

    def _ensure_tool_guard(self):
        if not hasattr(self, "_denied_tools"):
            self._init_tool_guard()

    async def _acting(self, tool_call: dict) -> dict | None:
        """
        Intercept tool calls.
        - Deny strictly forbidden tools
        - Pause and ask for approval for guarded tools
        - Pass through others
        """
        self._ensure_tool_guard()
        
        tool_name = tool_call.get("name", "")
        tool_input = tool_call.get("input", {})
        
        try:
            if tool_name in self._denied_tools:
                logger.warning(f"Tool guard: tool '{tool_name}' is denied.")
                return await self._acting_auto_denied(tool_call, tool_name)
            
            if tool_name in self._guarded_tools:
                # In a real app, this would check a DB or session state
                # For Phase 1, we log and require approval
                logger.info(f"Tool guard: tool '{tool_name}' requires approval.")
                # TODO: Implement real approval consumption logic here
                # return await self._acting_with_approval(tool_call, tool_name)
                pass
                
        except Exception as exc:
            logger.warning(f"Tool guard check error: {exc}", exc_info=True)

        # Delegate to super (ReActAgent's _acting)
        if hasattr(super(), '_acting'):
            return await super()._acting(tool_call)
        else:
            logger.error("Superclass does not have _acting method. Make sure to mix in with ReActAgent.")
            return None

    async def _acting_auto_denied(self, tool_call: dict, tool_name: str) -> dict | None:
        """Auto-deny a tool call."""
        denied_text = (
            f"⛔ **Tool Blocked / 工具已拦截**\n\n"
            f"- Tool / 工具: `{tool_name}`\n"
            f"This tool is blocked for security reasons.\n"
        )
        
        tool_res_msg = Msg(
            name="system",
            content=[{
                "type": "tool_result",
                "id": tool_call.get("id", ""),
                "name": tool_name,
                "output": [{"type": "text", "text": denied_text}]
            }],
            role="system"
        )
        
        await self.memory.add(tool_res_msg)
        return None


class MemoryCompactionHook:
    """
    Hook to automatically summarize and compact memory when it grows too large.
    """
    def __init__(self, max_tokens: int = 4000, summarization_model=None):
        self.max_tokens = max_tokens
        self.summarization_model = summarization_model

    async def __call__(self, agent: Any, kwargs: Dict[str, Any]) -> None:
        """
        Pre-reasoning hook to check memory size and compact if necessary.
        """
        if not hasattr(agent, 'memory') or not agent.memory:
            return

        # Simple token estimation (using char length for now, 1 token ≈ 4 chars)
        messages = agent.memory.get_memory() if hasattr(agent.memory, 'get_memory') else agent.memory
        
        if not isinstance(messages, list):
            return

        total_chars = sum(len(str(m.content)) for m in messages if m.content)
        estimated_tokens = total_chars / 4

        if estimated_tokens > self.max_tokens:
            logger.info(f"Memory size ({estimated_tokens} tokens) exceeds threshold ({self.max_tokens}). Compacting...")
            
            # Keep system prompt and recent messages
            system_msgs = [m for m in messages if getattr(m, 'role', '') == 'system']
            recent_msgs = messages[-3:] # Keep last 3 messages
            
            # The messages to summarize are the ones in between
            to_summarize = [m for m in messages if m not in system_msgs and m not in recent_msgs]
            
            if len(to_summarize) > 0:
                summary_text = await self._summarize_messages(to_summarize)
                
                # Replace memory with [System] + [Summary] + [Recent]
                summary_msg = Msg(name="system", content=f"Previous conversation summary: {summary_text}", role="system")
                
                new_memory = system_msgs + [summary_msg] + recent_msgs
                
                if hasattr(agent.memory, 'clear'):
                    agent.memory.clear()
                    for m in new_memory:
                        agent.memory.add(m)
                else:
                    agent.memory = new_memory
                    
            logger.info("Memory compaction completed.")

    async def _summarize_messages(self, messages: list) -> str:
        """Summarize a list of messages."""
        if self.summarization_model:
            try:
                # Format messages for the summarization prompt
                content_to_summarize = "\n".join([f"{getattr(m, 'name', 'User')}: {getattr(m, 'content', '')}" for m in messages])
                prompt = Msg(
                    name="user", 
                    content=f"Please provide a concise summary of the following conversation history, preserving key facts and decisions:\n\n{content_to_summarize}", 
                    role="user"
                )
                
                # We need to format the message list according to the model's expectations, but for simplicity
                # we'll just pass it directly if it's an AgentScope model.
                # Note: this depends on the specific model type, but most handle a simple list of Msgs.
                response = self.summarization_model([prompt])
                
                # Check if it's an async response
                import asyncio
                if asyncio.iscoroutine(response):
                    response = await response
                    
                content = getattr(response, 'content', None)
                if content:
                    if isinstance(content, list):
                        return "".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
                    return str(content)
            except Exception as e:
                logger.error(f"Error during memory summarization: {e}")
                
        return f"[Context compacted: {len(messages)} earlier messages omitted to save space]"
