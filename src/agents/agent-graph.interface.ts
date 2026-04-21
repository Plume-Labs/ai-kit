/**
 * Définition d'un nœud dans un graphe d'agents.
 */
export interface IGraphNodeDef {
  /** Identifiant unique du nœud */
  id: string;
  /** ID de l'agent à exécuter sur ce nœud (référence à IAgentConfig.id) */
  agentId: string;
  /** Prompt système propre au nœud (surcharge celui de l'agent) */
  systemPrompt?: string;
}

/**
 * Définition d'une arête dans un graphe d'agents.
 */
export interface IGraphEdgeDef {
  /** ID du nœud source */
  from: string;
  /** ID du nœud destination */
  to: string;
  /**
   * Condition optionnelle : nom d'une propriété de l'état à évaluer.
   * Si absent, l'arête est inconditionnelle.
   */
  condition?: string;
  /** Valeur attendue de la condition pour emprunter cette arête */
  conditionValue?: unknown;
}

/**
 * Définition complète d'un graphe d'agents hybride (LangGraph + DeepAgents).
 */
export interface IAgentGraph {
  /** Identifiant unique du graphe */
  id: string;
  /** ID de la memoire a utiliser (sinon memoire par defaut) */
  memoryId?: string;
  /** Nœuds du graphe */
  nodes: IGraphNodeDef[];
  /** Arêtes du graphe */
  edges: IGraphEdgeDef[];
  /** ID du nœud d'entrée */
  entryNodeId: string;
  /** ID du nœud de sortie (optionnel — END implicite si absent) */
  exitNodeId?: string;
}

/**
 * Résultat d'une exécution de graphe.
 */
export interface IGraphRunResult {
  output: unknown;
  finalNodeId?: string;
  meta?: Record<string, unknown>;
}
