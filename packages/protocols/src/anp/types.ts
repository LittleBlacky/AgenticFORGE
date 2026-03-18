/** ANP 协议核心类型定义 */

/** 服务信息 */
export interface ServiceInfo {
  serviceId: string;
  serviceType: string;
  endpoint: string;
  serviceName: string;
  capabilities: string[];
  metadata: Record<string, unknown>;
}

/** 网络节点 */
export interface NetworkNode {
  nodeId: string;
  endpoint: string;
  metadata: Record<string, unknown>;
  status: "active" | "inactive" | "unknown";
}

/** 网络统计 */
export interface NetworkStats {
  networkId: string;
  totalNodes: number;
  activeNodes: number;
  totalConnections: number;
  nodes: string[];
}

/** 路由路径 */
export type RoutePath = string[];

/** 服务发现过滤条件 */
export interface ServiceFilter {
  serviceType?: string;
  metadata?: Record<string, unknown>;
  capabilities?: string[];
}
