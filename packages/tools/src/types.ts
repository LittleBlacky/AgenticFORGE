export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default: unknown;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}
