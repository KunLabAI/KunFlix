export interface Agent {
  id?: string;
  name: string;
  description: string;
  provider_id: string;
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
  id: string;
  name: string;
  models: string[] | string;
  is_active: boolean;
}

export interface AgentFormValues extends Omit<Agent, 'id' | 'created_at' | 'updated_at'> {
  tools_enabled: boolean;
}

// ---------------------------------------------------------------------------
// Auth & User types
// ---------------------------------------------------------------------------
export interface User {
  id: string;
  email: string;
  nickname: string;
  role: 'user' | 'admin';
  is_active: boolean;
  current_chapter: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_input_chars: number;
  total_output_chars: number;
  last_login_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}
