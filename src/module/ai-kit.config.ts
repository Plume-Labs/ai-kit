import { IModelConfig } from '../interfaces/model.interface';
import { IMcpServerConfig } from '../interfaces/tool.interface';
import { IAcpServerConfig } from '../interfaces/acp.interface';
import { IAgentConfig } from '../interfaces/agent.interface';
import { IAgentGraph } from '../interfaces/agent-graph.interface';

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
   */
  checkpointer?: unknown;

  /**
   * Activer le tracing LangSmith via LANGCHAIN_TRACING_V2.
   * Si absent, la valeur de l'env est utilisée.
   */
  langSmithTracing?: boolean;
}

/**
 * Options de configuration dynamique après bootstrap.
 *
 * Cette configuration est additive par défaut.
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
