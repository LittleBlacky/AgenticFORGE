export type AgentHookEvent =
  | "beforeRun"
  | "afterRun"
  | "onError"
  | "beforeLLMCall"
  | "afterLLMCall"
  | "beforeToolCall"
  | "afterToolCall";

export interface AgentHookContext {
  event: AgentHookEvent;
  agentName: string;
  traceId: string;
  timestamp: string;
  inputText?: string;
  outputText?: string;
  llmRequest?: unknown;
  llmResponse?: unknown;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  error?: Error;
  metadata?: Record<string, unknown>;
}

export interface AgentHook {
  name: string;
  priority?: number;
  strict?: boolean;
  events?: AgentHookEvent[];
  handle: (context: AgentHookContext) => void | Promise<void>;
}
