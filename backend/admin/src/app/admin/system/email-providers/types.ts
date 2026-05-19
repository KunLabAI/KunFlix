// Email provider/template type definitions used across the System Email Providers page.
// Field shapes mirror backend Pydantic schemas (`EmailProviderResponse`, `EmailTemplateResponse`).

export interface EmailProvider {
  id: string;
  name: string;
  provider_type: string;
  api_key?: string;
  api_key_masked: string;
  api_base_url?: string | null;
  from_email: string;
  from_name?: string | null;
  reply_to?: string | null;
  is_default: boolean;
  is_active: boolean;
  last_error_at?: string | null;
  last_error_message?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EmailTemplate {
  id: string;
  code: string;
  name: string;
  subject: string;
  html_body: string;
  text_body?: string | null;
  available_variables?: string[] | null;
  created_at?: string;
  updated_at?: string;
}

export interface EmailProviderFormState {
  name: string;
  provider_type: string;
  api_key: string;
  api_base_url: string;
  from_email: string;
  from_name: string;
  reply_to: string;
  is_default: boolean;
  is_active: boolean;
}

export const DEFAULT_FORM: EmailProviderFormState = {
  name: "",
  provider_type: "resend",
  api_key: "",
  api_base_url: "",
  from_email: "",
  from_name: "",
  reply_to: "",
  is_default: false,
  is_active: true,
};

export const PROVIDER_TYPES = [
  { value: "resend", label: "Resend" },
];
