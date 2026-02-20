export interface Agent {
  id?: number;
  name: string;
  description: string;
  provider_id: number;
  model: string;
  temperature: number;
  context_window: number;
  system_prompt: string;
  tools: string[];
  thinking_mode: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LLMProvider {
  id: number;
  name: string;
  models: string[] | string;
  is_active: boolean;
}

export interface AgentFormValues extends Omit<Agent, 'id' | 'created_at' | 'updated_at'> {
  tools_enabled: boolean;
}
