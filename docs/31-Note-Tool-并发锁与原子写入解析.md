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
- 使用 `proper-lockfile` 对 `workspace` 目录加锁（跨进程互斥）。

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

```62:90:src/tools/builtin/note.ts
    this.indexFile = path.join(this.workspace, "notes_index.json");
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
### 3.1 获取锁与释放锁（proper-lockfile）
- 使用 `proper-lockfile` 对 `workspace` 目录加锁。
- `stale` 对应超时阈值，避免死锁。
- `retries` 配置轮询重试间隔。

```383:418:src/tools/builtin/note.ts
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const release = await lockfile.lock(this.workspace, {
        stale: this.lockTimeoutMs,
        retries: {
          retries: Math.max(
            0,
            Math.floor(this.lockTimeoutMs / this.lockRetryIntervalMs),
          ),
          minTimeout: this.lockRetryIntervalMs,
          maxTimeout: this.lockRetryIntervalMs,
        },
      });

      try {
        return await fn();
      } finally {
        await release();
      }
    } catch (error) {
      throw new Error(
        `获取笔记锁失败: ${error instanceof Error ? error.message : String(error)}`,
      );
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

### 3.6 正文原子写入（可选）
- 通过 `enableAtomicNoteWrites` 开关控制。
- 开启后，正文写入采用临时文件 → rename。

```445:464:src/tools/builtin/note.ts
  private writeNoteFile(notePath: string, content: string): void {
    if (!this.enableAtomicNoteWrites) {
      fs.writeFileSync(notePath, content, "utf-8");
      return;
    }

    const tmpPath = `${notePath}.tmp`;
    fs.writeFileSync(tmpPath, content, "utf-8");
    fs.renameSync(tmpPath, notePath);
  }
```

## 4. 关键机制与实现细节
- **锁粒度**：以工具级写操作为单位，避免索引与正文写入互相覆盖。
- **原子替换**：索引以临时文件 → rename 方式写入，保证切换原子性。
- **正文原子写（可选）**：对正文采用相同策略，需强一致时开启。

## 5. 例子（从输入到输出）
### 场景
- 两个进程同时调用 `note.create`。

### 关键步骤
1. 进程 A 通过 `proper-lockfile` 获取目录锁，写入索引。
2. 进程 B 进入重试等待，直到 A 释放锁。
3. 索引使用临时文件 → rename 原子替换。
4. 若开启 `enableAtomicNoteWrites`，正文同样使用原子替换。

### 结果
- 索引与正文写入顺序可控，避免并发覆盖。

## 6. 可靠性与降级策略
- **超时保护**：避免死锁导致永久等待。
- **异常释放**：`finally` 释放锁，降低锁残留概率。
- **索引原子替换**：降低索引损坏风险。
- **正文原子写（可选）**：通过 `enableAtomicNoteWrites` 控制。

## 7. 局限与演进建议
- `proper-lockfile` 对文件系统依赖较强，网络盘场景需评估稳定性。
- 原子写入对大文件有额外 IO 成本，可按需开启。
- 若需事务一致性，可引入日志或版本化存储。
