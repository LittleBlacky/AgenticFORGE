# NoteTool 并发锁与原子写入解析文档

## 1. 背景与目标
- **背景**：`NoteTool` 以本地文件持久化笔记与索引，多进程并发写入可能导致覆盖或索引损坏。
- **目标**：
  1. 增加跨进程互斥锁，确保写操作串行化。
  2. 支持锁超时与过期清理，避免死锁。
  3. 对索引文件采用原子替换写入，降低部分写入风险。

## 2. 核心组件与职责
### 2.1 锁文件与配置项
- `NoteToolOptions` 新增配置：
  - `lockTimeoutMs`：锁超时（默认 3000ms）
  - `lockRetryIntervalMs`：重试间隔（默认 120ms）
- 生成 `.notes.lock` 文件作为互斥锁。

```1:46:src/tools/builtin/note.ts
export interface NoteToolOptions {
  workspace?: string;
  autoBackup?: boolean;
  maxNotes?: number;
  expandable?: boolean;
  lockTimeoutMs?: number;
  lockRetryIntervalMs?: number;
}
```

```62:91:src/tools/builtin/note.ts
    this.indexFile = path.join(this.workspace, "notes_index.json");
    this.lockFile = path.join(this.workspace, ".notes.lock");
    this.lockTimeoutMs = options.lockTimeoutMs ?? 3000;
    this.lockRetryIntervalMs = options.lockRetryIntervalMs ?? 120;
```

### 2.2 写操作加锁流程
- 仅对写操作（create/update/delete/summary）加锁。
- 读取类操作不加锁。

```118:170:src/tools/builtin/note.ts
    const action = String(parameters.action ?? "") as NoteAction;
    const needsLock = action !== "read" && action !== "list" && action !== "search";

    if (!needsLock) {
      return this.executeAction(action, parameters);
    }

    return this.withLock(() => this.executeAction(action, parameters));
```

## 3. 关键流程（结合代码）
### 3.1 获取锁
- 使用 `fs.openSync(lockFile, "wx")` 原子创建锁文件。
- 锁文件写入 `pid + created_at`，用于过期判断。

```401:455:src/tools/builtin/note.ts
  private tryAcquireLock(): boolean {
    try {
      const fd = fs.openSync(this.lockFile, "wx");
      const payload = JSON.stringify({
        pid: process.pid,
        created_at: new Date().toISOString(),
      });
      fs.writeFileSync(fd, payload, "utf-8");
      fs.closeSync(fd);
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") {
        if (this.isLockExpired()) {
          this.releaseLock();
          return this.tryAcquireLock();
        }
        return false;
      }
      throw error;
    }
  }
```

### 3.2 轮询等待 + 超时保护
- 若锁已存在，按 `lockRetryIntervalMs` 轮询。
- 超过 `lockTimeoutMs` 报错，避免无限等待。

```370:399:src/tools/builtin/note.ts
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

### 3.3 过期锁清理
- 若锁文件存在但时间超过 `lockTimeoutMs`，视为过期并清理。

```457:477:src/tools/builtin/note.ts
  private isLockExpired(): boolean {
    try {
      const raw = fs.readFileSync(this.lockFile, "utf-8");
      const data = JSON.parse(raw) as {created_at?: string};
      if (!data.created_at) return false;
      const createdAt = Date.parse(data.created_at);
      if (Number.isNaN(createdAt)) return false;
      return Date.now() - createdAt > this.lockTimeoutMs;
    } catch {
      return false;
    }
  }
```

### 3.4 释放锁
- 写操作结束后删除锁文件。
- `finally` 中执行，保证异常时也能清理。

```479:490:src/tools/builtin/note.ts
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

### 3.5 索引原子写入
- 写入索引时先写临时文件 `.tmp`，再 `rename` 替换。
- 避免写入中断导致索引文件损坏。

```492:507:src/tools/builtin/note.ts
  private saveIndex(): void {
    const backupPath = `${this.indexFile}.bak`;
    const payload = JSON.stringify(this.notesIndex, null, 2);
    const tmpPath = `${this.indexFile}.tmp`;

    fs.writeFileSync(tmpPath, payload, "utf-8");
    fs.renameSync(tmpPath, this.indexFile);

    if (this.autoBackup) {
      fs.writeFileSync(backupPath, payload, "utf-8");
    }
  }
```

## 4. 关键机制与实现细节
- **锁粒度**：以工具级写操作为单位，避免索引与正文写入互相覆盖。
- **过期判断**：锁文件只记录创建时间，避免无期限占锁。
- **原子替换**：索引以临时文件 → rename 方式写入，保证切换原子性。

## 5. 例子（从输入到输出）
### 场景
- 两个进程同时调用 `note.create`。

### 关键步骤
1. 进程 A 创建 `.notes.lock`，写入索引。
2. 进程 B 发现锁存在，轮询等待。
3. A 写完释放锁，B 才进入执行。

### 结果
- 索引文件不会发生写入覆盖，保证最终一致性。

## 6. 可靠性与降级策略
- **超时保护**：避免死锁导致永久等待。
- **异常释放**：`finally` 释放锁，降低锁残留概率。
- **备份兜底**：`notes_index.json.bak` 可用于人工恢复。

## 7. 局限与演进建议
- 锁文件可能仍因进程硬崩溃残留，建议增加 PID 存活校验。
- 原子替换仅用于索引，正文文件仍是直接写入（如需强一致可扩展）。
- 更强锁建议：系统级锁或第三方库（`proper-lockfile`）。
