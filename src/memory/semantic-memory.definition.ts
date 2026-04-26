import { IPgVectorMemoryOptions } from './pg-vector.adapter';

const SEMANTIC_MEMORY_DEFINITION_KEY = Symbol.for('ai-kit:semantic-memory-definition');

// ─── Types ────────────────────────────────────────────────────────────────────

export type ISemanticMemoryDefinitionClass = abstract new (...args: any[]) => unknown;
export type SemanticMemoryDefinitionInput =
  | ISemanticMemoryDefinitionConfig
  | ISemanticMemoryDefinitionClass;

/**
 * Configuration d'une définition de mémoire sémantique déclarée par classe.
 *
 * Étend `IPgVectorMemoryOptions` (tableName, dimensions, defaultScope)
 * avec les champs d'identité propres au registre AiKit.
 */
export interface ISemanticMemoryDefinitionConfig extends IPgVectorMemoryOptions {
  /** Identifiant unique de la mémoire dans MemoryService */
  id: string;
  /** Si true, cette mémoire devient la mémoire par défaut */
  isDefault?: boolean;
}

// ─── Décorateur ──────────────────────────────────────────────────────────────

/**
 * Décore une classe comme définition de mémoire sémantique réutilisable.
 *
 * La classe décorée sert de marqueur et de vecteur de configuration —
 * elle n'est jamais instanciée directement. Passez-la à `SemanticMemoryFactory`
 * pour obtenir un adaptateur initialisé et enregistré.
 *
 * Utile dans les architectures CQRS / DDD : chaque bounded context déclare
 * sa propre mémoire isolée comme une classe nommée.
 *
 * @example
 * ```ts
 * // billing/billing-memory.ts
 * \@SemanticMemoryDefinition({
 *   id: 'billing-mem',
 *   defaultScope: { domain: 'billing', enterpriseId: 'ent-1' },
 * })
 * export class BillingMemory {}
 *
 * // billing/billing.module.ts (onModuleInit)
 * await semanticMemoryFactory.createAndRegister(BillingMemory, {
 *   dataSource: this.dataSource,
 *   embeddings: this.embeddings,
 * });
 * ```
 */
export function SemanticMemoryDefinition(
  config: ISemanticMemoryDefinitionConfig,
): ClassDecorator {
  validateConfig(config, 'SemanticMemoryDefinition');

  return (target: Function) => {
    Object.defineProperty(target, SEMANTIC_MEMORY_DEFINITION_KEY, {
      value: Object.freeze({ ...config }),
      enumerable: false,
      writable: false,
      configurable: true,
    });
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Lit la metadata d'une classe décorée avec `@SemanticMemoryDefinition`.
 * Retourne null si la classe n'est pas décorée.
 */
export function getSemanticMemoryDefinitionMetadata(
  target: unknown,
): ISemanticMemoryDefinitionConfig | null {
  if (typeof target !== 'function') {
    return null;
  }
  const metadata = (target as unknown as Record<PropertyKey, unknown>)[
    SEMANTIC_MEMORY_DEFINITION_KEY
  ];
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  return { ...(metadata as ISemanticMemoryDefinitionConfig) };
}

/**
 * Type guard pour les classes décorées avec `@SemanticMemoryDefinition`.
 */
export function isSemanticMemoryDefinitionClass(
  value: unknown,
): value is ISemanticMemoryDefinitionClass {
  return typeof value === 'function';
}

/**
 * Résout une entrée (classe décorée ou config brute) vers un `ISemanticMemoryDefinitionConfig`.
 * Lance une erreur si une classe non décorée est fournie.
 */
export function resolveSemanticMemoryDefinitionInput(
  input: SemanticMemoryDefinitionInput,
): ISemanticMemoryDefinitionConfig {
  if (isSemanticMemoryDefinitionClass(input)) {
    const metadata = getSemanticMemoryDefinitionMetadata(input);
    if (!metadata) {
      const name = (input as { name?: string }).name ?? 'AnonymousClass';
      throw new Error(
        `[AiKit] Définition de mémoire introuvable pour la classe "${name}": ` +
          'utilisez @SemanticMemoryDefinition(...)',
      );
    }
    return metadata;
  }
  validateConfig(input, 'Semantic memory config');
  return input;
}

// ─── Validation interne ───────────────────────────────────────────────────────

function validateConfig(
  config: Partial<ISemanticMemoryDefinitionConfig>,
  context: string,
): asserts config is ISemanticMemoryDefinitionConfig {
  if (!config || typeof config !== 'object') {
    throw new Error(`[AiKit] ${context}: invalid config object`);
  }
  if (!config.id || typeof config.id !== 'string') {
    throw new Error(`[AiKit] ${context}: "id" must be a non-empty string`);
  }
}
