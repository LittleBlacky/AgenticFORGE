/**
 * ANP 协议实现
 *
 * Agent Network Protocol — 网络管理与服务发现。
 *
 * 包含：
 * - ServiceInfo   服务描述数据类
 * - ANPDiscovery  服务注册与发现
 * - ANPNetwork    网络节点管理、路由、广播
 */

import {Protocol, ProtocolType} from "../base";
import type {
  ServiceInfo as IServiceInfo,
  NetworkNode,
  NetworkStats,
  RoutePath,
  ServiceFilter,
} from "./types";

// ---------------------------------------------------------------------------
// ServiceInfo
// ---------------------------------------------------------------------------

export class ServiceInfo implements IServiceInfo {
  readonly serviceId: string;
  readonly serviceType: string;
  readonly endpoint: string;
  readonly serviceName: string;
  readonly capabilities: string[];
  readonly metadata: Record<string, unknown>;

  constructor(params: {
    serviceId: string;
    serviceType: string;
    endpoint: string;
    serviceName?: string;
    capabilities?: string[];
    metadata?: Record<string, unknown>;
  }) {
    this.serviceId = params.serviceId;
    this.serviceType = params.serviceType;
    this.endpoint = params.endpoint;
    this.serviceName = params.serviceName ?? params.serviceId;
    this.capabilities = params.capabilities ?? [];
    this.metadata = params.metadata ?? {};
  }

  toDict(): IServiceInfo {
    return {
      serviceId: this.serviceId,
      serviceType: this.serviceType,
      endpoint: this.endpoint,
      serviceName: this.serviceName,
      capabilities: this.capabilities,
      metadata: this.metadata,
    };
  }

  static fromDict(data: IServiceInfo): ServiceInfo {
    return new ServiceInfo(data);
  }
}

// ---------------------------------------------------------------------------
// ANPDiscovery
// ---------------------------------------------------------------------------

export class ANPDiscovery extends Protocol {
  private readonly _services = new Map<string, ServiceInfo>();

  constructor() {
    super(ProtocolType.ANP);
  }

  registerService(service: ServiceInfo): boolean {
    this._services.set(service.serviceId, service);
    return true;
  }

  unregisterService(serviceId: string): boolean {
    return this._services.delete(serviceId);
  }

  discoverServices(filter: ServiceFilter = {}): ServiceInfo[] {
    let services = Array.from(this._services.values());

    if (filter.serviceType) {
      services = services.filter((s) => s.serviceType === filter.serviceType);
    }
    if (filter.capabilities && filter.capabilities.length > 0) {
      services = services.filter((s) =>
        filter.capabilities!.every((cap) => s.capabilities.includes(cap)),
      );
    }
    if (filter.metadata) {
      services = services.filter((s) =>
        Object.entries(filter.metadata!).every(([k, v]) => s.metadata[k] === v),
      );
    }

    return services;
  }

  findServicesByType(serviceType: string): ServiceInfo[] {
    return this.discoverServices({serviceType});
  }

  getService(serviceId: string): ServiceInfo | undefined {
    return this._services.get(serviceId);
  }

  listAllServices(): ServiceInfo[] {
    return Array.from(this._services.values());
  }

  get serviceCount(): number {
    return this._services.size;
  }
}

// ---------------------------------------------------------------------------
// ANPNetwork
// ---------------------------------------------------------------------------

export class ANPNetwork extends Protocol {
  readonly networkId: string;
  private readonly _nodes = new Map<string, NetworkNode>();
  private readonly _connections = new Map<string, Set<string>>();

  constructor(networkId = "default") {
    super(ProtocolType.ANP);
    this.networkId = networkId;
  }

  // Node management

  addNode(
    nodeId: string,
    endpoint: string,
    metadata: Record<string, unknown> = {},
  ): void {
    this._nodes.set(nodeId, {nodeId, endpoint, metadata, status: "active"});
    this._connections.set(nodeId, new Set());
  }

  /** Alias matching Python API: add_agent(service_id, endpoint) */
  addAgent(nodeId: string, endpoint: string, metadata?: Record<string, unknown>): void {
    this.addNode(nodeId, endpoint, metadata);
  }

  removeNode(nodeId: string): boolean {
    if (!this._nodes.has(nodeId)) return false;
    this._nodes.delete(nodeId);
    this._connections.delete(nodeId);
    for (const conns of this._connections.values()) conns.delete(nodeId);
    return true;
  }

  setNodeStatus(nodeId: string, status: NetworkNode["status"]): boolean {
    const node = this._nodes.get(nodeId);
    if (!node) return false;
    this._nodes.set(nodeId, {...node, status});
    return true;
  }

  getNodeInfo(nodeId: string): (NetworkNode & {connections: string[]}) | undefined {
    const node = this._nodes.get(nodeId);
    if (!node) return undefined;
    return {...node, connections: Array.from(this._connections.get(nodeId) ?? [])};
  }

  // Connection management

  connectNodes(fromNode: string, toNode: string): boolean {
    const conns = this._connections.get(fromNode);
    if (!conns || !this._nodes.has(toNode)) return false;
    conns.add(toNode);
    return true;
  }

  disconnectNodes(fromNode: string, toNode: string): boolean {
    return this._connections.get(fromNode)?.delete(toNode) ?? false;
  }

  getConnections(nodeId: string): string[] {
    return Array.from(this._connections.get(nodeId) ?? []);
  }

  // Routing

  /**
   * 简单路由：直连优先，否则尝试一跳中转。
   * 对应 Python 版 route_message()。
   */
  routeMessage(
    fromNode: string,
    toNode: string,
    _message?: Record<string, unknown>,
  ): RoutePath | null {
    if (!this._nodes.has(fromNode) || !this._nodes.has(toNode)) return null;

    if (this._connections.get(fromNode)?.has(toNode)) {
      return [fromNode, toNode];
    }

    for (const intermediate of this._connections.get(fromNode) ?? []) {
      if (this._connections.get(intermediate)?.has(toNode)) {
        return [fromNode, intermediate, toNode];
      }
    }

    return null;
  }

  /**
   * 广播消息到所有与 fromNode 直连的节点。
   * 对应 Python 版 broadcast_message()。
   */
  broadcastMessage(
    fromNode: string,
    _message: Record<string, unknown>,
  ): string[] {
    if (!this._connections.has(fromNode)) return [];
    return Array.from(this._connections.get(fromNode)!);
  }

  // Stats

  /** 对应 Python 版 get_network_stats() / get_network_status() */
  getNetworkStats(): NetworkStats {
    const totalConnections = Array.from(this._connections.values()).reduce(
      (sum, s) => sum + s.size,
      0,
    );
    const activeNodes = Array.from(this._nodes.values()).filter(
      (n) => n.status === "active",
    ).length;
    return {
      networkId: this.networkId,
      totalNodes: this._nodes.size,
      activeNodes,
      totalConnections,
      nodes: Array.from(this._nodes.keys()),
    };
  }

  /** Alias used in Python examples */
  getNetworkStatus(): NetworkStats & {healthStatus: string} {
    const stats = this.getNetworkStats();
    const healthStatus =
      stats.activeNodes === stats.totalNodes ? "healthy" :
      stats.activeNodes > 0 ? "degraded" : "down";
    return {...stats, healthStatus};
  }

  listNodes(): string[] {
    return Array.from(this._nodes.keys());
  }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

export function createExampleANPNetwork(): ANPNetwork {
  const network = new ANPNetwork("example_network");
  network.addNode("node1", "http://localhost:8001", {type: "agent", role: "coordinator"});
  network.addNode("node2", "http://localhost:8002", {type: "agent", role: "worker"});
  network.addNode("node3", "http://localhost:8003", {type: "agent", role: "worker"});
  network.connectNodes("node1", "node2");
  network.connectNodes("node1", "node3");
  network.connectNodes("node2", "node3");
  return network;
}
