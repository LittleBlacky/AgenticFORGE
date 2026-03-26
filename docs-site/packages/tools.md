# @agenticforge/tools

[![npm](https://img.shields.io/npm/v/@agenticforge/tools)](https://www.npmjs.com/package/@agenticforge/tools)

Tool abstraction layer — `Tool`, `ToolRegistry`, `ToolChain`, and `AsyncToolExecutor`.

## Installation

```bash
npm install @agenticforge/tools
```

## Exports

| Name | Description |
|------|-------------|
| `Tool` | Tool base class |
| `toolAction` | Factory with Zod parameter validation |
| `ToolRegistry` | Manages a collection of tools |
| `ToolChain` | Compose tools sequentially |
| `AsyncToolExecutor` | Concurrent execution with timeout |

See the [Tools Guide](/guide/tools) for detailed usage and examples.
