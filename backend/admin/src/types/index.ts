// ---------------------------------------------------------------------------
// Gemini 3.1 配置类型（仅思考、媒体、搜索）
// ---------------------------------------------------------------------------
export interface GeminiConfig {
  thinking_level?: "high" | "medium" | "low" | "minimal" | null;
  media_resolution?: "ultra_high" | "high" | "medium" | "low" | null;
  google_search_enabled?: boolean;
  google_image_search_enabled?: boolean;
}

// ---------------------------------------------------------------------------
// 统一图像生成配置（供应商无关）
// ---------------------------------------------------------------------------
export interface UnifiedImageConfig {
  aspect_ratio?: string | null;
  quality?: 'standard' | 'hd' | 'ultra' | null;
  batch_count?: number | null;  // 1-10
  output_format?: 'png' | 'jpeg' | 'webp' | null;
}

export interface UnifiedImageGenConfig {
  image_generation_enabled: boolean;
  image_provider_id?: string | null;  // 图像生成供应商 ID（跨 Provider 支持）
  image_model?: string | null;        // 图像生成模型名
  image_config?: UnifiedImageConfig | null;
}

// ---------------------------------------------------------------------------
// 上下文压缩配置
// ---------------------------------------------------------------------------
export interface CompactionConfig {
  enabled: boolean;
  provider_id?: string;
  model?: string;
  compact_ratio: number;
  reserve_ratio: number;
  tool_old_threshold: number;
  tool_recent_n: number;
  max_summary_tokens: number;
}

export interface Agent {
  id?: string;
  name: string;
  description: string;
  provider_id: string;
  model: string;
  agent_type: 'text' | 'image' | 'multimodal' | 'video';
  temperature: number;
  context_window: number;
  system_prompt: string;
  tools: string[];
  thinking_mode: boolean;
  input_credit_per_1m: number;
  output_credit_per_1m: number;
  image_output_credit_per_1m: number;
  search_credit_per_query: number;
  // Video pricing
  video_input_image_credit: number;
  video_input_second_credit: number;
  video_output_480p_credit: number;
  video_output_720p_credit: number;
  // 画布节点控制
  target_node_types: string[];
  // Leader configuration
  is_leader: boolean;
  coordination_modes: string[];
  member_agent_ids: string[];
  max_subtasks: number;
  enable_auto_review: boolean;
  // Gemini 3.1 配置
  gemini_config?: GeminiConfig;
  // 统一图像生成配置
  image_config?: UnifiedImageGenConfig;
  // 视频生成配置
  video_config?: VideoGenToolConfigData;
  // 上下文压缩配置
  compaction_config?: CompactionConfig;
  image_credit_per_image?: number;
  // 工具调用轮次限制
  max_tool_rounds?: number;
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
  agent_type: 'text' | 'image' | 'multimodal' | 'video';
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

// ---------------------------------------------------------------------------
// Video Task types
// ---------------------------------------------------------------------------
export interface VideoTaskResponse {
  id: string;
  xai_task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  video_mode: 'text_to_video' | 'image_to_video' | 'edit' | 'reference_images' | 'video_extension';
  prompt: string;
  duration: number;
  quality: '480p' | '512p' | '720p' | '768p' | '1080p';
  aspect_ratio?: string;
  video_url?: string | null;
  credit_cost: number;
  error_message?: string | null;
  provider_id: string;
  provider_name?: string;
  model: string;
  user_id: string;
  image_url?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface VideoTaskListResponse {
  items: VideoTaskResponse[];
  total: number;
  page: number;
  page_size: number;
}

export interface VideoCreateRequest {
  provider_id: string;
  model: string;
  video_mode: 'text_to_video' | 'image_to_video' | 'edit' | 'reference_images' | 'video_extension';
  prompt: string;
  image_url?: string;  // 首帧图片
  last_frame_image?: string;  // 尾帧图片 (MiniMax-Hailuo-02 支持)
  config?: {
    duration: number;
    quality: '480p' | '512p' | '720p' | '768p' | '1080p';
    aspect_ratio: string;
    prompt_optimizer?: boolean;  // MiniMax: 自动优化提示词
    fast_pretreatment?: boolean;  // MiniMax: 快速预处理
  };
}

// ---------------------------------------------------------------------------
// Tool Management types
// ---------------------------------------------------------------------------
export interface ToolMetadata {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ToolProviderInfo {
  provider_name: string;
  display_name: string;
  description: string;
  condition: string;
  tools: ToolMetadata[];
}

export interface AgentToolUsage {
  agent_id: string;
  agent_name: string;
  skills: string[];
  canvas_enabled: boolean;
  canvas_node_types: string[];
  image_gen_enabled: boolean;
  video_gen_enabled: boolean;
}

export interface ToolStats {
  total_executions: number;
  total_errors: number;
  error_rate: number;
  avg_duration_ms: number | null;
  by_tool: { tool_name: string; count: number; avg_duration_ms: number | null }[];
  by_provider: { provider_name: string; count: number }[];
}

export interface ToolExecution {
  id: string;
  tool_name: string;
  provider_name: string;
  agent_id: string | null;
  session_id: string | null;
  user_id: string | null;
  is_admin: boolean;
  theater_id: string | null;
  arguments: Record<string, any> | null;
  result_summary: string | null;
  status: 'success' | 'error';
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface ToolExecutionListResponse {
  items: ToolExecution[];
  total: number;
  skip: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Image Provider Capabilities types
// ---------------------------------------------------------------------------
export interface ImageProviderCapability {
  aspect_ratios: string[];
  qualities: string[];
  output_formats: string[];
  batch_count: { min: number; max: number };
}

export type ImageProviderCapabilities = Record<string, ImageProviderCapability>;

// ---------------------------------------------------------------------------
// Tool Config types (工具级别配置)
// ---------------------------------------------------------------------------
export interface ToolConfig {
  id: string;
  tool_name: string;
  config: Record<string, any>;
  is_enabled: boolean;
  created_at: string;
  updated_at?: string | null;
}

// 图像生成工具配置 (generate_image)
export interface ImageGenToolConfigData extends UnifiedImageGenConfig {}

export interface ImageGenToolConfig extends ToolConfig {
  tool_name: 'generate_image';
  config: ImageGenToolConfigData;
}

// ---------------------------------------------------------------------------
// 视频生成模型能力类型
// ---------------------------------------------------------------------------
export interface VideoModelCapabilities {
  provider: string;
  modes: string[];
  durations: number[];
  resolutions: string[];
  supports_first_frame: boolean;
  supports_last_frame: boolean;
  supports_reference_images: boolean;
  supports_video_extension: boolean;
  supports_video_edit: boolean;
  supports_audio: boolean;
  max_reference_images: number;
  supports_prompt_optimizer: boolean;
  supports_fast_pretreatment: boolean;
  aspect_ratios: string[];
}

export type VideoProviderCapabilities = Record<string, VideoModelCapabilities>;

// 视频生成工具配置 (generate_video)
export interface VideoGenToolConfigData {
  video_generation_enabled: boolean;
  video_provider_id?: string | null;
  video_model?: string | null;
  video_config?: {
    duration?: number;
    quality?: string;
    aspect_ratio?: string;
  } | null;
}

export interface VideoGenToolConfig extends ToolConfig {
  tool_name: 'generate_video';
  config: VideoGenToolConfigData;
}
