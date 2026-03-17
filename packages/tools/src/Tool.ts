import "reflect-metadata";
import {z, type ZodType} from "zod";
import type {ToolParameter} from "./types";

export type {ToolParameter};

// ---------------------------------------------------------------------------
// OpenAI function-calling schema
// ---------------------------------------------------------------------------

export interface OpenAIFunctionSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// toolAction decorator
// ---------------------------------------------------------------------------

const TOOL_ACTIONS_META_KEY = Symbol("tool:actions");

export interface ToolActionMeta {
  key: string;
  description: string;
  method: string;
}

/**
 * Decorator that registers a method as a named tool action.
 * Usage: @toolAction("action_key", "Description")
 */
export function toolAction(key: string, description: string) {
  return function (
    target: object,
    propertyKey: string,
    _descriptor: PropertyDescriptor,
  ): void {
    const existing: ToolActionMeta[] =
      Reflect.getMetadata(TOOL_ACTIONS_META_KEY, target) ?? [];
    existing.push({key, description, method: propertyKey});
    Reflect.defineMetadata(TOOL_ACTIONS_META_KEY, existing, target);
  };
}

// ---------------------------------------------------------------------------
// Tool base class
// ---------------------------------------------------------------------------

export abstract class Tool {
  readonly name: string;
  readonly description: string;
  readonly expandable: boolean;

  constructor(name: string, description: string, expandable = false) {
    this.name = name;
    this.description = description;
    this.expandable = expandable;
  }

  abstract run(parameters: Record<string, unknown>): Promise<string> | string;
  abstract getParameters(): ToolParameter[];

  /**
   * Validate that required parameters are present and have basic types.
   * Returns true if valid.
   */
  validateParameters(parameters: Record<string, unknown>): boolean {
    const params = this.getParameters();
    for (const p of params) {
      if (p.required && (parameters[p.name] === undefined || parameters[p.name] === null)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Validate and coerce parameters, returning a Result object.
   */
  validateAndNormalizeParameters(
    parameters: Record<string, unknown>,
  ): {success: true; data: Record<string, unknown>} | {success: false; error: string} {
    const params = this.getParameters();
    const data: Record<string, unknown> = {};

    for (const p of params) {
      const val = parameters[p.name];
      if (val === undefined || val === null) {
        if (p.required) {
          return {success: false, error: `Missing required parameter: ${p.name}`};
        }
        data[p.name] = p.default;
      } else {
        data[p.name] = val;
      }
    }

    // pass through any extra parameters
    for (const [key, val] of Object.entries(parameters)) {
      if (!(key in data)) data[key] = val;
    }

    return {success: true, data};
  }

  /**
   * Convert this Tool to an OpenAI function-calling schema.
   */
  toOpenAISchema(): OpenAIFunctionSchema {
    const params = this.getParameters();
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const p of params) {
      properties[p.name] = {
        type: mapType(p.type),
        description: p.description,
        ...(p.default !== null && p.default !== undefined
          ? {default: p.default}
          : {}),
      };
      if (p.required) required.push(p.name);
    }

    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: "object",
          properties,
          ...(required.length > 0 ? {required} : {}),
        },
      },
    };
  }

  /**
   * Return a formatted description of all available tool actions (for system prompt).
   */
  describe(): string {
    const params = this.getParameters();
    const paramStr = params
      .map(
        (p) =>
          `  - ${p.name} (${p.type}${p.required ? ", required" : ""}): ${p.description}`,
      )
      .join("\n");
    return `Tool: ${this.name}\nDescription: ${this.description}\nParameters:\n${paramStr}`;
  }
}

function mapType(type: string): string {
  const t = (type ?? "string").toLowerCase();
  if (["string", "number", "integer", "boolean", "array", "object"].includes(t)) {
    return t;
  }
  return "string";
}

// ---------------------------------------------------------------------------
// FunctionTool — wraps a plain async/sync function
// ---------------------------------------------------------------------------

export interface FunctionTool<TArgs = Record<string, unknown>> {
  name: string;
  description: string;
  func: (args: TArgs) => string | Promise<string>;
  schema?: ZodType<TArgs>;
}

/**
 * Convenience factory for creating type-safe function tools.
 *
 * ```ts
 * const myTool = defineFunctionTool({
 *   name: "myTool",
 *   description: "...",
 *   schema: z.object({ input: z.string() }),
 *   func: ({ input }) => input.toUpperCase(),
 * });
 * ```
 */
export function defineFunctionTool<TArgs extends Record<string, unknown>>(
  options: FunctionTool<TArgs>,
): FunctionTool<TArgs> {
  return options;
}

export {z};
