/**
 * 协议基础类型定义
 *
 * 定义了 HelloAgents / AgenticFORGE 三种核心通信协议的枚举与基类：
 * - MCP  (Model Context Protocol)：工具调用、资源访问
 * - A2A  (Agent-to-Agent Protocol)：智能体间通信与协作
 * - ANP  (Agent Network Protocol)：网络管理、服务发现
 */

/** 协议类型枚举 */
export enum ProtocolType {
  MCP = "mcp",
  A2A = "a2a",
  ANP = "anp",
}

/** 协议基类（概念性，各协议独立实现） */
export abstract class Protocol {
  protected readonly _protocolType: ProtocolType;
  protected readonly _version: string;

  constructor(protocolType: ProtocolType, version = "1.0.0") {
    this._protocolType = protocolType;
    this._version = version;
  }

  get protocolName(): string {
    return this._protocolType;
  }

  get version(): string {
    return this._version;
  }

  toString(): string {
    return `${this.constructor.name}(protocol=${this.protocolName}, version=${this.version})`;
  }
}
