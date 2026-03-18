# NoteTool 并发写入锁解析

## 1. 背景与目标
- **背景**：`NoteTool` 以本地文件存储笔记与索引，在多进程并发写入时可能发生覆盖与索引损坏。
- **目标**：引入简单可靠的跨进程互斥机制，确保写操作串行化。

## 2. 核心机制
### 2.1 锁文件（lock file）
- 在 `workspace` 下创建 `.notes.lock` 作为互斥锁。
- 使用 `fs.openSync(lockFile, "wx")` 原子创建锁文件：
  - 若文件不存在 → 创建成功，获得锁。
  - 若文件已存在 → 抛出 `EEXIST`，表示锁被占用。

```454:495:src/tools/builtin/note.ts
  private tryAcquireLock(): boolean {
    try {
      const fd = fs.openSync(this.lockFile, "wx");
      fs.closeSync(fd);
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") {
        return false;
      }
      throw error;
    }
  }
```

### 2.2 轮询等待 + 超时
- 当锁被占用时，当前进程会按照 `lockRetryIntervalMs` 轮询尝试。
- 超过 `lockTimeoutMs` 仍未获取锁，会抛出超时错误。

```430:452:src/tools/builtin/note.ts
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    while (true) {
      const acquired = this.tryAcquireLock();
      if (acquired) break;

      if (Date.now() - start > this.lockTimeoutMs) {
        throw new Error("获取笔记锁超时，请稍后重试");
      }

      await new Promise((resolve) =>
        setTimeout(resolve, this.lockRetryIntervalMs),
      );
    }

    try {
      return await fn();
    } finally {
      this.releaseLock();
    }
  }
```

### 2.3 释放锁
- 写操作结束后删除 `.notes.lock` 文件释放锁。
- 即使写操作失败，也会在 `finally` 中释放锁。

```497:509:src/tools/builtin/note.ts
  private releaseLock(): void {
    try {
      if (fs.existsSync(this.lockFile)) {
        fs.unlinkSync(this.lockFile);
      }
    } catch {
      // ignore
    }
  }
```

## 3. 适用范围
- **加锁操作**：`create / update / delete / summary`（会修改索引或内容）。
- **无需加锁**：`read / list / search`（纯读取）。

```118:166:src/tools/builtin/note.ts
    const action = String(parameters.action ?? "") as NoteAction;
    const needsLock = action !== "read" && action !== "list" && action !== "search";

    if (!needsLock) {
      return this.executeAction(action, parameters);
    }

    return this.withLock(() => this.executeAction(action, parameters));
```

## 4. 设计取舍
- **优点**：
  - 跨进程可用（文件系统互斥）。
  - 实现简单，易于维护。
- **限制**：
  - 基于轮询，存在等待与延迟。
  - 锁文件可能因进程异常退出而残留，需要人工清理。

## 5. 可靠性与降级策略
- **超时保护**：避免无限等待。
- **写入失败仍释放锁**：`finally` 保证锁清理。

## 6. 演进建议
- 增加锁文件内容（PID/时间戳），支持**过期锁清理**。
- 采用更强的系统级锁（如 `flock`/`proper-lockfile`）。
- 引入事务式索引写入（先写临时文件再原子替换）。
