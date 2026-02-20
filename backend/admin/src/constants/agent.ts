export const AVAILABLE_TOOLS = [
  { label: 'Web Search', value: 'web_search' },
  { label: 'Code Interpreter', value: 'code_interpreter' },
  { label: 'Image Generation', value: 'image_gen' },
  { label: 'Knowledge Base', value: 'knowledge_base' },
];

export const DEFAULT_AGENT_VALUES = {
  name: '',
  description: '',
  provider_id: 0,
  model: '',
  system_prompt: '',
  temperature: 0.7,
  context_window: 4096,
  thinking_mode: false,
  tools_enabled: false,
  tools: [],
};
