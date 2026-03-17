export type Provider = "openai" | "anthropic" | "local";

export interface ProviderConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  timeoutMs?: number;
}

export interface LLMOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  timeoutMs?: number;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}
