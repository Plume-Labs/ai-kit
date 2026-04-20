// ─── Module ──────────────────────────────────────────────────────────────────
export { AiKitModule } from './module/ai-kit.module';
export type { AiKitModuleOptions, AiKitRuntimeConfigureOptions } from './module/ai-kit.config';
export type { AiKitModuleAsyncOptions } from './module/ai-kit.module';

// ─── Interfaces publiques ─────────────────────────────────────────────────────
export type {
  IModelConfig,
  IModelProvider,
  ModelProviderType,
} from './interfaces/model.interface';

export type { ITool, IMcpServerConfig, IMcpStdioServerConfig, IMcpSseServerConfig } from './interfaces/tool.interface';

export type {
  IHumanInTheLoopConfig,
  IInterruptOnConfig,
  IInterruptDecision,
  IInterruptPayload,
} from './interfaces/hitl.interface';

export type { ISubAgentSpec, ICompiledSubAgent } from './interfaces/sub-agent.interface';

export type {
  IAgent,
  IAgentConfig,
  IAgentRunOptions,
  IAgentResult,
  IAgentMessage,
  IAgentStreamEvent,
} from './interfaces/agent.interface';

export type {
  IAgentGraph,
  IGraphNodeDef,
  IGraphEdgeDef,
  IGraphRunResult,
} from './interfaces/agent-graph.interface';

export type {
  IAcpServerConfig,
  IAcpAgentConfig,
  IAcpAuthMethod,
  IAcpAuthMethodAgent,
  IAcpAuthMethodEnvVar,
} from './interfaces/acp.interface';

// ─── Services (pour injection directe) ───────────────────────────────────────
export { ModelService } from './services/model.service';
export { McpService } from './services/mcp.service';
export { HitlService } from './services/hitl.service';
export { SubAgentService } from './services/sub-agent.service';
export { AgentService } from './services/agent.service';
export { AgentGraphService } from './services/agent-graph.service';
export { AcpService } from './services/acp.service';
export { AiKitConfiguratorService } from './services/ai-kit-configurator.service';

// ─── Tokens d'injection ───────────────────────────────────────────────────────
export {
  AI_KIT_OPTIONS,
  AI_KIT_MODEL_SERVICE,
  AI_KIT_MCP_SERVICE,
  AI_KIT_AGENT_SERVICE,
  AI_KIT_AGENT_GRAPH_SERVICE,
  AI_KIT_SUB_AGENT_SERVICE,
  AI_KIT_HITL_SERVICE,
  AI_KIT_ACP_SERVICE,
} from './module/ai-kit.tokens';
