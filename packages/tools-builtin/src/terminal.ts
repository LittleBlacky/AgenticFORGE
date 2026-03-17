import {spawn} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {Tool, type ToolParameter} from "@agenticforge/tools";

export interface TerminalToolOptions {
  workspace?: string;
  timeoutMs?: number;
  maxOutputSize?: number;
  allowCd?: boolean;
  osType?: "auto" | "windows" | "linux" | "mac";
}

export class TerminalTool extends Tool {
  static readonly ALLOWED_COMMANDS = new Set([
    "ls",
    "dir",
    "tree",
    "cat",
    "type",
    "head",
    "tail",
    "less",
    "more",
    "find",
    "where",
    "grep",
    "egrep",
    "fgrep",
    "findstr",
    "wc",
    "sort",
    "uniq",
    "cut",
    "awk",
    "sed",
    "pwd",
    "cd",
    "file",
    "stat",
    "du",
    "df",
    "echo",
    "which",
    "whereis",
    "python",
    "python3",
    "node",
    "bash",
    "sh",
    "powershell",
    "cmd",
  ]);

  private readonly workspace: string;
  private readonly timeoutMs: number;
  private readonly maxOutputSize: number;
  private readonly allowCd: boolean;
  private readonly osType: "windows" | "linux" | "mac";
  private currentDir: string;

  constructor(options: TerminalToolOptions = {}) {
    super(
      "terminal",
      "跨平台命令行工具 - 执行安全的文件系统、文本处理和代码执行命令（支持Windows/Linux/Mac）",
    );

    this.workspace = path.resolve(options.workspace ?? ".");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxOutputSize = options.maxOutputSize ?? 10 * 1024 * 1024;
    this.allowCd = options.allowCd ?? true;
    this.osType = this.detectOs(options.osType ?? "auto");
    this.currentDir = this.workspace;

    fs.mkdirSync(this.workspace, {recursive: true});
  }

  async run(parameters: Record<string, unknown>): Promise<string> {
    const parsed = this.schema.safeParse(parameters);
    if (!parsed.success) {
      return "❌ 参数验证失败";
    }

    const command = parsed.data.command.trim();
    if (!command) return "❌ 命令不能为空";

    const parts = this.tokenizeCommand(command);
    if (parts.length === 0) return "❌ 命令不能为空";

    const normalized = this.normalizeCommand(parts);
    const baseCommand = normalized[0]!;
    if (!TerminalTool.ALLOWED_COMMANDS.has(baseCommand)) {
      return `❌ 不允许的命令: ${baseCommand}\n允许的命令: ${[...TerminalTool.ALLOWED_COMMANDS].sort().join(", ")}`;
    }

    if (baseCommand === "cd") {
      return this.handleCd(normalized);
    }

    return this.executeCommand(normalized.join(" "));
  }

  getParameters(): ToolParameter[] {
    return [
      {
        name: "command",
        type: "string",
        description:
          "要执行的命令（白名单安全命令），示例: 'ls -la', 'cat file.txt', 'grep pattern *.ts'",
        required: true,
        default: null,
      },
    ];
  }

  private get schema(): z.ZodSchema<{command: string}> {
    return z.object({
      command: z.string().min(1),
    });
  }

  private detectOs(osType: TerminalToolOptions["osType"]): "windows" | "linux" | "mac" {
    if (osType && osType !== "auto") return osType;

    const platform = process.platform;
    if (platform === "win32") return "windows";
    if (platform === "darwin") return "mac";
    return "linux";
  }

  private tokenizeCommand(command: string): string[] {
    const parts: string[] = [];
    let current = "";
    let quote: '"' | "'" | null = null;

    for (let i = 0; i < command.length; i++) {
      const char = command[i]!;
      if (quote) {
        if (char === quote) {
          quote = null;
        } else {
          current += char;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }

      if (/\s/.test(char)) {
        if (current.length > 0) {
          parts.push(current);
          current = "";
        }
        continue;
      }

      current += char;
    }

    if (current.length > 0) parts.push(current);
    return parts;
  }

  private normalizeCommand(parts: string[]): string[] {
    if (this.osType !== "windows") return parts;

    const [command, ...rest] = parts;
    if (!command) return parts;

    const commandMap: Record<string, string> = {
      ls: "dir",
      pwd: "cd",
      cat: "type",
      which: "where",
    };

    const normalized = commandMap[command] ?? command;
    return [normalized, ...rest];
  }

  private handleCd(parts: string[]): string {
    if (!this.allowCd) return "❌ cd 命令已禁用";

    if (parts.length < 2) {
      return `当前目录: ${this.currentDir}`;
    }

    const targetDir = parts[1]!;
    let newDir: string;

    if (targetDir === "..") {
      newDir = path.dirname(this.currentDir);
    } else if (targetDir === ".") {
      newDir = this.currentDir;
    } else if (targetDir === "~") {
      newDir = this.workspace;
    } else {
      newDir = path.resolve(this.currentDir, targetDir);
    }

    if (!this.isWithinWorkspace(newDir)) {
      return `❌ 不允许访问工作目录外的路径: ${newDir}`;
    }

    if (!fs.existsSync(newDir)) {
      return `❌ 目录不存在: ${newDir}`;
    }

    if (!fs.statSync(newDir).isDirectory()) {
      return `❌ 不是目录: ${newDir}`;
    }

    this.currentDir = newDir;
    return `✅ 切换到目录: ${this.currentDir}`;
  }

  private isWithinWorkspace(targetPath: string): boolean {
    const resolvedWorkspace = path.resolve(this.workspace);
    const resolvedTarget = path.resolve(targetPath);
    return (
      resolvedTarget === resolvedWorkspace ||
      resolvedTarget.startsWith(`${resolvedWorkspace}${path.sep}`)
    );
  }

  private executeCommand(command: string): Promise<string> {
    return new Promise((resolve) => {
      const child = spawn(command, {
        cwd: this.currentDir,
        shell: true,
        env: process.env,
      });

      let output = "";
      let outputSize = 0;
      let finished = false;

      const finish = (result: string) => {
        if (finished) return;
        finished = true;
        resolve(result || "✅ 命令执行成功（无输出）");
      };

      const appendOutput = (chunk: Buffer | string, label?: string) => {
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
        const decorated = label ? `\n[${label}]\n${text}` : text;
        output += decorated;
        outputSize += decorated.length;

        if (outputSize > this.maxOutputSize) {
          output = output.slice(0, this.maxOutputSize);
          output += `\n\n⚠️ 输出被截断（超过 ${this.maxOutputSize} 字节）`;
          finish(output);
          child.kill();
        }
      };

      const timeout = setTimeout(() => {
        appendOutput(`❌ 命令执行超时（超过 ${this.timeoutMs / 1000} 秒）`);
        child.kill();
        finish(output);
      }, this.timeoutMs);

      child.stdout.on("data", (data) => appendOutput(data));
      child.stderr.on("data", (data) => appendOutput(data, "stderr"));

      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          finish(`⚠️ 命令返回码: ${code}\n\n${output}`);
          return;
        }
        finish(output);
      });

      child.on("error", (error) => {
        clearTimeout(timeout);
        finish(`❌ 命令执行失败: ${error.message}`);
      });
    });
  }

  getCurrentDir(): string {
    return this.currentDir;
  }

  resetDir(): void {
    this.currentDir = this.workspace;
  }

  getOsType(): string {
    return this.osType;
  }
}
