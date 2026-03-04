// ---------------------------------------------------------------------------
// Gemini 3.1 配置类型
// ---------------------------------------------------------------------------
export interface GeminiImageConfig {
  aspect_ratio?: "auto" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | null;
  image_size?: "4K" | "2K" | "1024" | "512" | "auto" | null;
  output_format?: "png" | "jpeg" | "webp" | null;  // 输出格式
  batch_count?: number | null;  // 批量生成数量 (1-8)
  // 参考图片数量限制配置
  max_person_images?: number | null;  // 角色参考图片最大数量 (0-4)
  max_object_images?: number | null;  // 高保真对象图片最大数量 (0-10)
}

export interface GeminiConfig {
  thinking_level?: "high" | "medium" | "low" | "minimal" | null;
  media_resolution?: "ultra_high" | "high" | "medium" | "low" | null;
  image_generation_enabled?: boolean;  // 图片生成开关
  image_config?: GeminiImageConfig | null;
  google_search_enabled?: boolean;  // Google 搜索开关
  google_image_search_enabled?: boolean;  // Google 图片搜索开关
}

export interface Agent {
  id?: string;
  name: string;
  description: string;
  provider_id: string;
  model: string;
  agent_type: 'text' | 'image' | 'multimodal';
  temperature: number;
  context_window: number;
  system_prompt: string;
  tools: string[];
  thinking_mode: boolean;
  input_credit_per_1m: number;
  output_credit_per_1m: number;
  image_output_credit_per_1m: number;
  search_credit_per_query: number;
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
  model_costs?: Record<string, Record<string, number>>;
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
  is_active: boolean;
  current_chapter: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_input_chars: number;
  total_output_chars: number;
  credits: number;
  // 订阅信息
  subscription_plan_id?: string | null;
  subscription_status: 'inactive' | 'active' | 'expired';
  subscription_start_at?: string | null;
  subscription_end_at?: string | null;
  last_login_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Admin {
  id: string;
  email: string;
  nickname: string;
  permission_level: string;
  is_active: boolean;
  credits: number;
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

export interface AdminTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  admin: Admin;
}

export interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// ---------------------------------------------------------------------------
// Credit Transaction types
// ---------------------------------------------------------------------------
export interface CreditTransaction {
  id: string;
  user_id: string;
  agent_id?: string | null;
  session_id?: string | null;
  transaction_type: 'deduction' | 'recharge' | 'admin_adjust';
  amount: number;
  balance_before: number;
  balance_after: number;
  input_tokens: number;
  output_tokens: number;
  metadata_json?: Record<string, any> | null;
  description?: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Subscription Plan types
// ---------------------------------------------------------------------------
export interface SubscriptionPlan {
  id: string;
  name: string;
  description?: string;
  price_usd: number;
  credits: number;
  billing_period: 'monthly' | 'yearly' | 'lifetime';
  features: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Prompt Template types
// ---------------------------------------------------------------------------
export interface PromptTemplateVariable {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'textarea';
  required: boolean;
  options?: string[] | null;
  default?: any;
  description?: string | null;
}

export interface PromptTemplate {
  id?: string;
  name: string;
  description?: string | null;
  template_type: string;
  agent_type: 'text' | 'image' | 'multimodal';
  system_prompt_template: string;
  user_prompt_template?: string | null;
  output_schema: Record<string, any>;
  variables_schema: PromptTemplateVariable[];
  default_agent_id?: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}
