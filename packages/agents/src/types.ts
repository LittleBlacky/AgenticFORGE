import type { Message } from "@agenticforge/core";

export interface AgentRunOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface AgentStep {
  thought: string;
  action?: string;
  actionInput?: string;
  observation?: string;
  isFinal: boolean;
  finalAnswer?: string;
}

export interface AgentTrace {
  steps: AgentStep[];
  finalAnswer: string;
  inputText: string;
  history: Message[];
}
