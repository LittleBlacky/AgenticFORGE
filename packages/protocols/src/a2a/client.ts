/**
 * A2A 客户端实现
 *
 * 通过 HTTP 与 A2AServer 通信，也支持内存模式（直接持有 A2AServer 实例）。
 *
 * 使用示例：
 * ```ts
 * // HTTP 模式
 * const client = new A2AClient("http://localhost:5000");
 * const answer = await client.ask("calculate 10 * 5");
 *
 * // 内存模式
 * const client = new A2AClient(server);
 * const result = await client.executeSkill("greet", "hello");
 * ```
 */

import type {A2AServer} from "./server";
import type {
  A2AServerInfo,
  AskResult,
  SkillExecuteResult,
  AgentNode,
} from "./types";

export type A2AClientSource = A2AServer | string;

export class A2AClient {
  private readonly source: A2AClientSource;

  constructor(source: A2AClientSource) {
    this.source = source;
  }

  private get _baseUrl(): string {
    return (this.source as string).replace(/\/$/, "");
  }

  private _isInMemory(): boolean {
    return typeof this.source !== "string";
  }

  // ---------------------------------------------------------------------------
  // Ask
  // ---------------------------------------------------------------------------

  async ask(question: string): Promise<string> {
    if (this._isInMemory()) {
      const result = await (this.source as A2AServer).ask(question);
      return result.answer;
    }
    const res = await this._post<AskResult>("/ask", {question});
    return res.answer;
  }

  // ---------------------------------------------------------------------------
  // Skills
  // ---------------------------------------------------------------------------

  async executeSkill(
    skillName: string,
    text = "",
    data?: Record<string, unknown>,
  ): Promise<SkillExecuteResult> {
    if (this._isInMemory()) {
      return (this.source as A2AServer).executeSkill(skillName, text, data);
    }
    return this._post<SkillExecuteResult>(`/execute/${encodeURIComponent(skillName)}`, {
      text,
      data,
    });
  }

  async listSkills(): Promise<string[]> {
    if (this._isInMemory()) {
      return (this.source as A2AServer).listSkills();
    }
    const res = await this._get<{skills: Array<{name: string}>}>("/skills");
    return res.skills.map((s) => s.name);
  }

  // ---------------------------------------------------------------------------
  // Info
  // ---------------------------------------------------------------------------

  async getInfo(): Promise<A2AServerInfo> {
    if (this._isInMemory()) {
      return (this.source as A2AServer).getInfo();
    }
    return this._get<A2AServerInfo>("/info");
  }

  async ping(): Promise<boolean> {
    if (this._isInMemory()) return true;
    try {
      const res = await fetch(`${this._baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async _get<T>(path: string): Promise<T> {
    const res = await fetch(`${this._baseUrl}${path}`, {
      headers: {Accept: "application/json"},
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`A2AClient GET ${path} failed (${res.status}): ${text}`);
    }
    return res.json() as Promise<T>;
  }

  private async _post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this._baseUrl}${path}`, {
      method: "POST",
      headers: {"Content-Type": "application/json", Accept: "application/json"},
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`A2AClient POST ${path} failed (${res.status}): ${text}`);
    }
    return res.json() as Promise<T>;
  }
}

// ---------------------------------------------------------------------------
// AgentNetwork — manages a collection of A2A agents
// ---------------------------------------------------------------------------

export class AgentNetwork {
  readonly name: string;
  private readonly _agents = new Map<string, string>(); // name -> url

  constructor(name = "Agent Network") {
    this.name = name;
  }

  addAgent(agentName: string, agentUrl: string): void {
    this._agents.set(agentName, agentUrl);
  }

  removeAgent(agentName: string): boolean {
    return this._agents.delete(agentName);
  }

  getAgent(agentName: string): A2AClient {
    const url = this._agents.get(agentName);
    if (!url) throw new Error(`Agent '${agentName}' not found in network`);
    return new A2AClient(url);
  }

  listAgents(): AgentNode[] {
    return Array.from(this._agents.entries()).map(([name, url]) => ({name, url}));
  }

  /** 探测 URL 列表，自动注册可达的 Agent */
  async discoverAgents(urls: string[]): Promise<number> {
    let discovered = 0;
    for (const url of urls) {
      try {
        const client = new A2AClient(url);
        const reachable = await client.ping();
        if (!reachable) continue;
        const info = await client.getInfo();
        this.addAgent(info.name, url);
        discovered++;
      } catch {
        // skip unreachable
      }
    }
    return discovered;
  }
}

// ---------------------------------------------------------------------------
// AgentRegistry — central registry for A2A agents
// ---------------------------------------------------------------------------

export class AgentRegistry {
  readonly name: string;
  readonly description: string;
  private readonly _entries = new Map<string, AgentNode>();

  constructor(
    name = "Agent Registry",
    description = "Central agent registry",
  ) {
    this.name = name;
    this.description = description;
  }

  registerAgent(
    agentName: string,
    agentUrl: string,
    metadata?: Record<string, unknown>,
  ): void {
    this._entries.set(agentName, {
      name: agentName,
      url: agentUrl,
      metadata,
      registeredAt: new Date().toISOString(),
    });
  }

  unregisterAgent(agentName: string): boolean {
    return this._entries.delete(agentName);
  }

  findAgent(agentName: string): AgentNode | undefined {
    return this._entries.get(agentName);
  }

  listAgents(): AgentNode[] {
    return Array.from(this._entries.values());
  }

  getInfo(): {
    name: string;
    description: string;
    protocol: "A2A";
    type: "registry";
    registeredAgents: number;
  } {
    return {
      name: this.name,
      description: this.description,
      protocol: "A2A",
      type: "registry",
      registeredAgents: this._entries.size,
    };
  }
}
