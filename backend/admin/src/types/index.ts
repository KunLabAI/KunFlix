// ---------------------------------------------------------------------------
// Gemini 3.1 配置类型
// ---------------------------------------------------------------------------
export interface GeminiImageConfig {
  aspect_ratio?: "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | null;
  image_size?: "4K" | "2K" | "auto" | null;
}

export interface GeminiConfig {
  thinking_level?: "high" | "medium" | "low" | "minimal" | null;
  media_resolution?: "ultra_high" | "high" | "medium" | "low" | null;
  image_generation_enabled?: boolean;  // 图片生成开关
  image_config?: GeminiImageConfig | null;
}

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
  input_credit_per_1k: number;
  output_credit_per_1k: number;
  // Leader configuration
  is_leader: boolean;
  coordination_modes: string[];
  member_agent_ids: string[];
  max_subtasks: number;
  enable_auto_review: boolean;
  // Gemini 3.1 配置
  gemini_config?: GeminiConfig;
  created_at?: string;
  updated_at?: string;
}

export interface LLMProvider {
  id: string;
  name: string;
  provider_type: string;
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
  credits: number;
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
