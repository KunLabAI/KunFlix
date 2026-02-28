export const AVAILABLE_TOOLS = [
  { label: 'Web Search', value: 'web_search' },
  { label: 'Code Interpreter', value: 'code_interpreter' },
  { label: 'Image Generation', value: 'image_gen' },
  { label: 'Knowledge Base', value: 'knowledge_base' },
];

export const COORDINATION_MODES = [
  { label: '流水线', value: 'pipeline', description: '顺序或并行执行任务' },
  { label: '计划', value: 'plan', description: '任务分解与依赖调度' },
  { label: '讨论', value: 'discussion', description: '多智能体多轮讨论协作' },
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
  input_credit_per_1m: 0,
  output_credit_per_1m: 0,
  image_output_credit_per_1m: 0,
  search_credit_per_query: 0,
  // Leader defaults
  is_leader: false,
  coordination_modes: [],
  member_agent_ids: [],
  max_subtasks: 10,
  enable_auto_review: true,
};
