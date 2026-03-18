# TerminalTool 解析文档

## 1. 背景与目标
- **背景**：Agent 需要安全地执行只读命令以完成文件检索、日志查看、代码分析等任务。
- **目标**：在受控环境中提供跨平台命令行能力，保证安全性与可控性。

## 2. 核心组件与职责
### 2.1 TerminalTool
- 提供 `run` 入口，执行受限命令。
- 支持白名单命令、工作目录限制、超时与输出大小限制。

```1:84:src/tools/builtin/terminal.ts
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
}
```

### 2.2 安全限制
- 命令必须在白名单中。
- `cd` 只能在 workspace 目录内移动。
- 超时默认 30 秒，输出默认 10MB。

```86:158:src/tools/builtin/terminal.ts
  async run(parameters: Record<string, unknown>): Promise<string> {
    const parsed = this.schema.safeParse(parameters);
    if (!parsed.success) {
      return "❌ 参数验证失败";
    }

    const command = parsed.data.command.trim();
    if (!command) return "❌ 命令不能为空";

    const parts = this.tokenizeCommand(command);
    if (parts.length === 0) return "❌ 命令不能为空";

    const baseCommand = parts[0]!;
    if (!TerminalTool.ALLOWED_COMMANDS.has(baseCommand)) {
      return `❌ 不允许的命令: ${baseCommand}\n允许的命令: ${[...TerminalTool.ALLOWED_COMMANDS].sort().join(", ")}`;
    }

    if (baseCommand === "cd") {
      return this.handleCd(parts);
    }

    return this.executeCommand(command);
  }
```

## 3. 关键流程（结合代码）
### 3.1 命令解析与白名单校验
- 解析用户输入的命令并校验基础命令是否允许。
- 禁止运行 `rm/mv/chmod` 等高风险命令。

### 3.2 工作目录限制
- `cd` 只能进入 `workspace` 内路径。

```171:239:src/tools/builtin/terminal.ts
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
```

### 3.3 执行命令与输出限制
- 使用 `spawn` 执行命令。
- 超时或输出过大时提前终止。

```247:333:src/tools/builtin/terminal.ts
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
```

## 4. 例子（从输入到输出）
### 场景
- 列出目录内容并查看文件内容。

### 关键步骤
1. `run({command: "ls"})`
2. `run({command: "cat package.json"})`

### 结果
- 返回命令输出文本，若输出过大则自动截断。

## 5. 可靠性与降级策略
- **超时保护**：超时后终止子进程并返回提示。
- **输出限制**：输出过大时截断，避免内存爆炸。
- **目录限制**：禁止访问 workspace 之外路径。

## 6. 局限与演进建议
- 白名单仅提供基础命令，若需扩展需审慎增加。
- 不支持复杂 pipeline 的精细权限控制。
- 如需更强安全控制，可引入沙箱（如容器或 WASI）。
