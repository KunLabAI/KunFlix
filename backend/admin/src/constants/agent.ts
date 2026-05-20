export const COORDINATION_MODES = [
  { label: '统一协作', value: 'unified', description: '智能判断简单/复杂任务，自动选择回答方式' },
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
  // Leader defaults
  is_leader: false,
  coordination_modes: ['unified'],
  member_agent_ids: [],
  max_subtasks: 10,
  enable_auto_review: true,
};
