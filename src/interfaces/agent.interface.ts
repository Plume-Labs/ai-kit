import { IHumanInTheLoopConfig } from './hitl.interface';
import { ISubAgentSpec } from './sub-agent.interface';

/**
 * Options d'exécution d'un agent.
 */
export interface IAgentRunOptions {
  /** Identifiant de thread pour la mémoire et la reprise HITL */
  threadId?: string;
  /** Entrée textuelle ou structurée */
  input: string | Record<string, unknown>;
  /** Streaming activé ? */
  stream?: boolean;
  /** Valeurs de contexte supplémentaires */
  context?: Record<string, unknown>;
}

/**
 * Résultat d'une exécution d'agent.
 */
export interface IAgentResult {
  /** Réponse finale de l'agent */
  output: string | Record<string, unknown>;
  /** Messages échangés pendant l'exécution */
  messages?: IAgentMessage[];
  /** Metadata (durée, tokens, etc.) */
  meta?: Record<string, unknown>;
}

/**
 * Message dans la conversation agent.
 */
export interface IAgentMessage {
  role: 'human' | 'ai' | 'tool' | 'system';
  content: string | Record<string, unknown>;
  toolCallId?: string;
  toolName?: string;
}

/**
 * Événement streamed lors d'une exécution.
 */
export interface IAgentStreamEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'interrupt' | 'done' | 'error';
  data: unknown;
}

/**
 * Configuration d'un agent personnalisable.
 */
export interface IAgentConfig {
  /** Identifiant unique de l'agent dans le module */
  id: string;
  /** ID du modèle enregistré dans ModelService (optionnel, utilise le défaut sinon) */
  modelId?: string;
  /** Prompt système */
  systemPrompt?: string;
  /** IDs des serveurs MCP à utiliser */
  mcpServerIds?: string[];
  /** Sous-agents à déléguer */
  subAgents?: ISubAgentSpec[];
  /** Configuration HITL */
  hitl?: IHumanInTheLoopConfig;
  /** Format de réponse structurée (schema JSON) */
  responseFormat?: Record<string, unknown>;
  /** Options supplémentaires deepagents */
  extra?: Record<string, unknown>;
}

/**
 * Interface opaque d'un agent prêt à l'exécution.
 */
export interface IAgent {
  readonly id: string;
  /** @internal objet interne deepagents — ne pas utiliser directement */
  readonly _internal: unknown;
}
