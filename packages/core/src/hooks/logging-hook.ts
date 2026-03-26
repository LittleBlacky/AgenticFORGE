import type { AgentHook, AgentHookContext, AgentHookEvent } from "./types";

export interface ConsoleLoggingHookOptions {
  name?: string;
  priority?: number;
  strict?: boolean;
  events?: AgentHookEvent[];
  logger?: (line: string, context: AgentHookContext) => void;
}

export function createConsoleLoggingHook(options: ConsoleLoggingHookOptions = {}): AgentHook {
  const logger = options.logger ?? ((line: string) => console.log(line));

  return {
    name: options.name ?? "console-logging-hook",
    priority: options.priority ?? 0,
    strict: options.strict ?? false,
    events: options.events,
    async handle(context) {
      const line = [
        `[AgentHook]`,
        `event=${context.event}`,
        `agent=${context.agentName}`,
        `trace=${context.traceId}`,
        context.toolName ? `tool=${context.toolName}` : "",
        context.error ? `error=${context.error.message}` : "",
      ]
        .filter(Boolean)
        .join(" ");

      logger(line, context);
    },
  };
}
