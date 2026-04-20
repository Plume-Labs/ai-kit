import { IHumanInTheLoopConfig } from './hitl.interface';

/**
 * Spécification d'un sous-agent.
 * Utilisé pour définir les sous-agents d'un agent parent.
 */
export interface ISubAgentSpec {
  /** Nom unique du sous-agent */
  name: string;
  /** Description des capacités du sous-agent */
  description: string;
  /** Prompt système optionnel */
  systemPrompt?: string;
  /** ID du modèle enregistré dans ModelService */
  modelId?: string;
  /** Configuration HITL propre au sous-agent */
  hitl?: IHumanInTheLoopConfig;
  /**
   * Pour les sous-agents asynchrones distants (ACP/LangGraph Cloud).
   * Si présent, le sous-agent est traité comme `AsyncSubAgent`.
   */
  graphId?: string;
  /** URL du serveur distant (LangGraph Cloud, etc.) */
  remoteUrl?: string;
}

/**
 * Sous-agent compilé (wrappé, prêt à l'injection dans un agent parent).
 * Opaque pour les utilisateurs — géré en interne par SubAgentService.
 */
export interface ICompiledSubAgent {
  readonly name: string;
  /** @internal objet interne deepagents — ne pas utiliser directement */
  readonly _internal: unknown;
}
