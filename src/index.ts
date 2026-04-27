// ─── Module ──────────────────────────────────────────────────────────────────
export { AiKitModule } from './module/ai-kit.module';
export type { AiKitModuleOptions, AiKitRuntimeConfigureOptions, AiKitFeatureOptions } from './module/ai-kit.config';
export type { AiKitModuleAsyncOptions } from './module/ai-kit.module';

// ─── Interfaces publiques ─────────────────────────────────────────────────────
export type {
  IModelConfig,
  IModelProvider,
  ModelProviderType,
} from './models/model.interface';

export type { ITool, IMcpServerConfig, IMcpStdioServerConfig, IMcpSseServerConfig, IToolConfig } from './interfaces/tool.interface';
export type {
  SecurityToolPreset,
  IPromptInjectionGuardOptions,
  IPiiRedactorOptions,
  IContentPolicyGuardOptions,
  ISecurityToolConfig,
  ISecurityToolDescriptor,
} from './interfaces/security-tool.interface';

export type {
  IHumanInTheLoopConfig,
  IInterruptOnConfig,
  IInterruptDecision,
  IInterruptPayload,
} from './interfaces/hitl.interface';

export type {
  ISubAgentSpec,
  ICompiledSubAgent,
  ISubAgentDefinitionClass,
  SubAgentDefinitionInput,
} from './agents/sub-agent.interface';
export {
  SubAgentDefinition,
  getSubAgentDefinitionMetadata,
  isSubAgentDefinitionClass,
} from './agents/sub-agent.definition';

export type {
  IAgentConfig,
  IAgentRunOptions,
  IAgentResult,
  IAgentMessage,
  IAgentStreamEvent,
} from './agents/agent';

export type { IAgentDefinitionClass, AgentDefinitionInput } from './agents/agent.definition';
export {
  AgentDefinition,
  UsesSubAgents,
  getAgentDefinitionMetadata,
  isAgentDefinitionClass,
  resolveAgentDefinitionInput,
} from './agents/agent.definition';

export type {
  IAgentGraph,
  IGraphNodeDef,
  IGraphEdgeDef,
  IGraphRunResult,
} from './agents/agent-graph.interface';

export type {
  IAcpServerConfig,
  IAcpAgentConfig,
  IAcpAuthMethod,
  IAcpAuthMethodAgent,
  IAcpAuthMethodEnvVar,
} from './interfaces/acp.interface';

export type { IMemoryAdapter, IMemoryConfig, ISemanticMemoryAdapter, ICompositeMemoryAdapter, ConsolidatedMemoryEntry, ISemanticSearchOptions, MemoryScope } from './interfaces/memory.interface';

// ─── Objets domaine ───────────────────────────────────────────────────────────
export { Agent } from './agents/agent';
export { AgentGraph } from './agents/agent-graph';

// ─── Factories ────────────────────────────────────────────────────────────────
export { AgentFactory } from './agents/agent.factory';
export { AgentGraphFactory } from './agents/agent-graph.factory';

// ─── Décorateurs d'injection ──────────────────────────────────────────────────
export { InjectAgent, InjectAgentGraph, getAgentToken, getAgentGraphToken } from './agents/agent.tokens';
export { InjectTool, getToolToken } from './interfaces/tool.tokens';
export { InjectSecurityTool, getSecurityToolToken } from './interfaces/security-tool.tokens';
export { InjectMemory, getMemoryToken } from './interfaces/memory.tokens';

// ─── Services (pour injection directe) ───────────────────────────────────────
export { ModelService } from './models/model.service';
export { McpService } from './services/mcp.service';
export { SecurityToolService } from './security/security-tool.service';
export { MemoryService } from './services/memory.service';
export { HitlService } from './services/hitl.service';
export { SubAgentService } from './agents/sub-agent.service';
export { AgentService } from './agents/agent.service';
export { AgentGraphService } from './agents/agent-graph.service';
export { AcpService } from './services/acp.service';
export { AiKitConfiguratorService } from './services/ai-kit-configurator.service';
export { AiKitFeatureInitializer } from './services/ai-kit-feature-initializer.service';
export { ToolSelectorService } from './services/tool-selector.service';
export type { IToolSelectionConfig } from './services/tool-selector.service';

// ─── Tokens d'injection ───────────────────────────────────────────────────────
export {
  AI_KIT_OPTIONS,
  AI_KIT_MODEL_SERVICE,
  AI_KIT_MCP_SERVICE,
  AI_KIT_SECURITY_TOOL_SERVICE,
  AI_KIT_MEMORY_SERVICE,
  AI_KIT_AGENT_SERVICE,
  AI_KIT_AGENT_GRAPH_SERVICE,
  AI_KIT_SUB_AGENT_SERVICE,
  AI_KIT_HITL_SERVICE,
  AI_KIT_ACP_SERVICE,
  AI_KIT_FEATURE_OPTIONS,
} from './module/ai-kit.tokens';

export { CheckpointerMemoryAdapter, InMemoryAdapter } from './interfaces/memory.interface';

// ─── Adaptateurs mémoire ──────────────────────────────────────────────────────
export { PostgresCheckpointerAdapter } from './memory/postgres-checkpointer.adapter';
export { PgVectorMemoryAdapter } from './memory/pg-vector.adapter';
export type { IDataSource, IPgVectorMemoryOptions } from './memory/pg-vector.adapter';
export { PgFullMemoryAdapter } from './memory/pg-full.adapter';
export type { IPgFullMemoryOptions } from './memory/pg-full.adapter';
export { MemoryConsolidationService } from './services/memory-consolidation.service';
export type { IConsolidationOptions } from './services/memory-consolidation.service';
export { SemanticMemoryDefinition, getSemanticMemoryDefinitionMetadata, isSemanticMemoryDefinitionClass, resolveSemanticMemoryDefinitionInput } from './memory/semantic-memory.definition';
export type { ISemanticMemoryDefinitionConfig, ISemanticMemoryDefinitionClass, SemanticMemoryDefinitionInput } from './memory/semantic-memory.definition';
export { SemanticMemoryFactory } from './memory/semantic-memory.factory';
export type { ISemanticMemoryRuntimeDeps } from './memory/semantic-memory.factory';
