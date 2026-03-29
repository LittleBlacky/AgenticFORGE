import "reflect-metadata";
import { z, type ZodType } from "zod";
import type { ToolParameter } from "./types";

export type { ToolParameter };

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
  return function (target: object, propertyKey: string, _descriptor: PropertyDescriptor): void {
    const existing: ToolActionMeta[] = Reflect.getMetadata(TOOL_ACTIONS_META_KEY, target) ?? [];
    existing.push({ key, description, method: propertyKey });
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

  private _zodSchemaCache: z.ZodObject<z.ZodRawShape> | null = null;

  constructor(name: string, description: string, expandable = false) {
    this.name = name;
    this.description = description;
    this.expandable = expandable;
  }

  abstract run(parameters: Record<string, unknown>): Promise<string> | string;
  abstract getParameters(): ToolParameter[];

  /**
   * Optional override: provide a custom Zod schema for precise validation.
   * If not overridden, a schema is automatically built from getParameters().
   *
   * ```ts
   * protected zodSchema() {
   *   return z.object({
   *     url: z.string().url("Must be a valid URL"),
   *     count: z.number().int().min(1).max(100),
   *   });
   * }
   * ```
   */
  protected zodSchema(): z.ZodObject<z.ZodRawShape> | null {
    return null;
  }

  /**
   * Build a Zod schema from getParameters() with type coercion.
   * Uses cache to avoid rebuilding on every call.
   */
  private buildZodSchema(): z.ZodObject<z.ZodRawShape> {
    if (this._zodSchemaCache) return this._zodSchemaCache;

    const shape: Record<string, z.ZodTypeAny> = {};
    for (const p of this.getParameters()) {
      let base: z.ZodTypeAny;
      switch (p.type) {
        case "number":
          base = z.coerce.number();
          break;
        case "integer":
          base = z.coerce.number().int();
          break;
        case "boolean":
          base = z.coerce.boolean();
          break;
        case "array":
          base = z.array(z.unknown());
          break;
        case "object":
          base = z.record(z.string(), z.unknown());
          break;
        default:
          // For string type: use z.string() not z.coerce.string() so that
          // null / undefined correctly fail required validation instead of
          // being coerced to the literal string "null" / "undefined".
          base = z.string();
          break;
      }

      if (p.required) {
        // Required: reject null and undefined explicitly
        shape[p.name] = base;
      } else {
        // Optional: fill with default if provided, otherwise allow undefined
        const withDefault =
          p.default !== null && p.default !== undefined
            ? base.default(p.default as never)
            : base.optional();
        shape[p.name] = withDefault;
      }
    }

    this._zodSchemaCache = z.object(shape);
    return this._zodSchemaCache;
  }

  /**
   * Validate that required parameters are present.
   * Returns true if valid.
   */
  validateParameters(parameters: Record<string, unknown>): boolean {
    return this.validateAndNormalizeParameters(parameters).success;
  }

  /**
   * Validate and coerce parameters using Zod.
   * Uses zodSchema() override if provided, otherwise auto-builds from getParameters().
   */
  validateAndNormalizeParameters(
    parameters: Record<string, unknown>,
  ): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
    const schema = this.zodSchema() ?? this.buildZodSchema();
    const result = schema.safeParse(parameters);
    if (!result.success) {
      const msg = result.error.issues
        .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
        .join("; ");
      return { success: false, error: msg };
    }
    return { success: true, data: result.data as Record<string, unknown> };
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
        ...(p.default !== null && p.default !== undefined ? { default: p.default } : {}),
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
          ...(required.length > 0 ? { required } : {}),
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
      .map((p) => `  - ${p.name} (${p.type}${p.required ? ", required" : ""}): ${p.description}`)
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

export { z };
