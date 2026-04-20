/**
 * Configuration du Human-in-the-Loop (HITL).
 * Décrit sur quels outils interrompre l'agent pour validation humaine.
 */
export interface IHumanInTheLoopConfig {
  /**
   * Map outil → activation HITL.
   * `true` interrompt toujours avant l'appel.
   * Un objet permet une configuration fine (confirmation, timeout, etc.).
   */
  interruptOn?: Record<string, boolean | IInterruptOnConfig>;
}

/**
 * Configuration fine d'une interruption sur un outil.
 */
export interface IInterruptOnConfig {
  /** Activer l'interruption */
  enabled: boolean;
  /** Message affiché à l'humain */
  prompt?: string;
}

/**
 * Décision prise par l'humain suite à une interruption.
 */
export interface IInterruptDecision {
  /** Thread / conversation ID concerné */
  threadId: string;
  /** `approve` pour continuer, `reject` pour annuler, `edit` pour modifier les paramètres */
  action: 'approve' | 'reject' | 'edit';
  /** Valeur de remplacement si action === 'edit' */
  updatedInput?: Record<string, unknown>;
}

/**
 * Payload transmis lors d'une interruption.
 */
export interface IInterruptPayload {
  threadId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  /** Callback appelé avec la décision de l'humain */
  resolve: (decision: IInterruptDecision) => void;
}
