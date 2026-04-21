import { IModelConfig } from '../models/model.interface';
import { IMcpServerConfig, IToolConfig } from '../interfaces/tool.interface';
import { IMemoryConfig } from '../interfaces/memory.interface';
import { IAcpServerConfig } from '../interfaces/acp.interface';
import { IAgentConfig } from '../agents/agent';
import { IAgentGraph } from '../agents/agent-graph.interface';

/**
 * Options de configuration du module AiKit.
 * Passées à AiKitModule.forRoot() ou AiKitModule.forRootAsync().
 */
export interface AiKitModuleOptions {
  /**
   * Configurations des providers de modèles.
   * Le premier de la liste devient le provider par défaut.
   */
  models?: IModelConfig[];

  /**
   * Configurations des serveurs MCP à connecter au démarrage.
   */
  mcpServers?: IMcpServerConfig[];

  /**
   * Outils personnalisés à enregistrer dans McpService.
   */
  tools?: IToolConfig[];

  /**
   * Memoires personnalisees a enregistrer dans MemoryService.
   */
  memories?: IMemoryConfig[];

  /**
   * Identifiant de la memoire par defaut.
   */
  defaultMemoryId?: string;

  /**
   * Configuration optionnelle du serveur ACP.
   * Si absent, le serveur ACP ne démarre pas.
   */
  acp?: IAcpServerConfig;

  /**
   * Agents pré-enregistrés au démarrage du module.
   */
  agents?: IAgentConfig[];

  /**
   * Graphes d'agents pré-enregistrés au démarrage du module.
   */
  graphs?: IAgentGraph[];

  /**
   * Implémentation d'un checkpointer personnalisé pour LangGraph.
   * Si absent, un InMemorySaver est utilisé.
   * @deprecated Utiliser `memories` + `defaultMemoryId`.
   */
  checkpointer?: unknown;

  /**
   * Activer le tracing LangSmith via LANGCHAIN_TRACING_V2.
   * Si absent, la valeur de l'env est utilisée.
   */
  langSmithTracing?: boolean;
}

/**
 * Options de configuration d'un feature module.
 *
 * Permet à un module NestJS d'enregistrer des agents, outils MCP, modèles ou graphes
 * sans passer par forRoot() — via AiKitModule.forFeature().
 */
export interface AiKitFeatureOptions {
  /**
   * Agents à enregistrer dans AgentService au boot du feature module.
   * Fusionnés avec les agents existants (pas de remplacement).
   */
  agents?: IAgentConfig[];

  /**
   * Serveurs MCP à connecter et outils à exposer dans McpService.
   * Fusionnés avec les serveurs existants par id.
   */
  mcpServers?: IMcpServerConfig[];

  /**
   * Outils personnalisés à enregistrer dans McpService.
   * Fusionnés avec les outils existants par id.
   */
  tools?: IToolConfig[];

  /**
   * Memoires personnalisees a enregistrer dans MemoryService.
   */
  memories?: IMemoryConfig[];

  /**
   * Modèles à enregistrer dans ModelService.
   */
  models?: IModelConfig[];

  /**
   * Graphes d'agents à enregistrer dans AgentGraphService.
   */
  graphs?: IAgentGraph[];
}

/**
 * Options de configuration dynamique aprs bootstrap.
 *
 * Cette configuration est additive par dfaut.
 */
export type AiKitRuntimeConfigureOptions = Omit<Partial<AiKitModuleOptions>, 'acp'> & {
  /**
   * Si true, remplace complètement la liste des serveurs MCP avant rechargement.
   * Sinon, les serveurs sont fusionnés par id (comportement par défaut).
   */
  replaceMcpServers?: boolean;

  /**
   * Si true, autorise l'écrasement d'un agent existant lors de l'enregistrement.
   */
  overwriteAgents?: boolean;

  /**
   * Si true, force le redémarrage du serveur ACP même avec une config identique.
   */
  restartAcp?: boolean;

  /**
   * Permet d'arrêter le serveur ACP en passant null.
   */
  acp?: IAcpServerConfig | null;
};
