import { ISubAgentSpec } from './sub-agent.interface';

const SUB_AGENT_DEFINITION_METADATA_KEY = Symbol.for('ai-kit:sub-agent-definition');

/**
 * Décore une classe comme définition de sous-agent réutilisable.
 */
export function SubAgentDefinition(spec: ISubAgentSpec): ClassDecorator {
  validateSubAgentSpec(spec, 'Sub-agent definition decorator');

  return (target: Function) => {
    Object.defineProperty(target, SUB_AGENT_DEFINITION_METADATA_KEY, {
      value: Object.freeze({ ...spec }),
      enumerable: false,
      writable: false,
      configurable: false,
    });
  };
}

/**
 * Lit la metadata d'une classe de définition de sous-agent.
 */
export function getSubAgentDefinitionMetadata(target: unknown): ISubAgentSpec | null {
  if (typeof target !== 'function') {
    return null;
  }

  const metadata = (target as unknown as Record<PropertyKey, unknown>)[
    SUB_AGENT_DEFINITION_METADATA_KEY
  ];
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  return { ...(metadata as ISubAgentSpec) };
}

/**
 * Type guard utilitaire pour les classes candidates.
 */
export function isSubAgentDefinitionClass(value: unknown): value is abstract new (...args: any[]) => unknown {
  return typeof value === 'function';
}

function validateSubAgentSpec(spec: ISubAgentSpec, context: string): void {
  if (!spec || typeof spec !== 'object') {
    throw new Error(`[AiKit] ${context}: invalid spec object`);
  }
  if (!spec.name || typeof spec.name !== 'string') {
    throw new Error(`[AiKit] ${context}: "name" must be a non-empty string`);
  }
  if (!spec.description || typeof spec.description !== 'string') {
    throw new Error(`[AiKit] ${context}: "description" must be a non-empty string`);
  }
}
