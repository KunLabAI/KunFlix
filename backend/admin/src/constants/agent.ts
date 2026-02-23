export const AVAILABLE_TOOLS = [
  { label: 'Web Search', value: 'web_search' },
  { label: 'Code Interpreter', value: 'code_interpreter' },
  { label: 'Image Generation', value: 'image_gen' },
  { label: 'Knowledge Base', value: 'knowledge_base' },
];

export const COORDINATION_MODES = [
  { label: 'Pipeline', value: 'pipeline', description: 'Sequential or parallel task execution' },
  { label: 'Plan', value: 'plan', description: 'Task decomposition with dependencies' },
  { label: 'Discussion', value: 'discussion', description: 'Multi-round discussion among agents' },
];

export const DEFAULT_AGENT_VALUES = {
  name: '',
  description: '',
  provider_id: '',
  model: '',
  system_prompt: '',
  temperature: 0.7,
  context_window: 4096,
  thinking_mode: false,
  tools_enabled: false,
  tools: [],
  input_credit_per_1k: 0,
  output_credit_per_1k: 0,
  // Leader defaults
  is_leader: false,
  coordination_modes: [],
  member_agent_ids: [],
  max_subtasks: 10,
  enable_auto_review: true,
};
