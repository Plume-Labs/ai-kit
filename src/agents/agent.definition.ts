import { IAgentConfig } from './agent';
import { SubAgentDefinitionInput } from './sub-agent.interface';

const AGENT_DEFINITION_METADATA_KEY = Symbol.for('ai-kit:agent-definition');

export type IAgentDefinitionClass = abstract new (...args: any[]) => unknown;
export type AgentDefinitionInput = IAgentConfig | IAgentDefinitionClass;

/**
 * Décore une classe comme définition d'agent réutilisable.
 */
export function AgentDefinition(config: IAgentConfig): ClassDecorator {
  validateAgentConfig(config, 'Agent definition decorator');

  return (target: Function) => {
    const current = getAgentDefinitionMetadata(target) ?? {};
    const merged = mergeAgentConfig(current, config);
    setAgentDefinitionMetadata(target, merged);
  };
}

/**
 * Ajoute des relations vers des sous-agents (specs ou classes décorées).
 */
export function UsesSubAgents(subAgents: SubAgentDefinitionInput[]): ClassDecorator {
  if (!Array.isArray(subAgents)) {
    throw new Error('[AiKit] UsesSubAgents: "subAgents" must be an array');
  }

  return (target: Function) => {
    const current = getAgentDefinitionMetadata(target) ?? {};
    const merged: Partial<IAgentConfig> = {
      ...current,
      subAgents: [...(current.subAgents ?? []), ...subAgents],
    };
    setAgentDefinitionMetadata(target, merged);
  };
}

/**
 * Lit la metadata de définition d'agent associée à une classe.
 */
export function getAgentDefinitionMetadata(target: unknown): Partial<IAgentConfig> | null {
  if (typeof target !== 'function') {
    return null;
  }

  const metadata = (target as unknown as Record<PropertyKey, unknown>)[
    AGENT_DEFINITION_METADATA_KEY
  ];

  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const config = metadata as Partial<IAgentConfig>;
  return {
    ...config,
    ...(config.subAgents ? { subAgents: [...config.subAgents] } : {}),
  };
}

export function isAgentDefinitionClass(value: unknown): value is IAgentDefinitionClass {
  return typeof value === 'function';
}

/**
 * Résout une entrée d'agent (objet ou classe) vers une config exploitable.
 */
export function resolveAgentDefinitionInput(input: AgentDefinitionInput): IAgentConfig {
  if (isAgentDefinitionClass(input)) {
    const metadata = getAgentDefinitionMetadata(input);
    if (!metadata) {
      throw new Error(
        `[AiKit] Agent introuvable pour la classe "${input.name || 'AnonymousClass'}": utilisez @AgentDefinition(...)`,
      );
    }
    validateAgentConfig(metadata, `Classe ${input.name || 'AnonymousClass'}`);
    return metadata;
  }

  validateAgentConfig(input, 'Agent config');
  return input;
}

function setAgentDefinitionMetadata(target: Function, config: Partial<IAgentConfig>): void {
  Object.defineProperty(target, AGENT_DEFINITION_METADATA_KEY, {
    value: Object.freeze({
      ...config,
      ...(config.subAgents ? { subAgents: Object.freeze([...config.subAgents]) } : {}),
    }),
    enumerable: false,
    writable: false,
    configurable: true,
  });
}

function mergeAgentConfig(
  base: Partial<IAgentConfig>,
  next: Partial<IAgentConfig>,
): Partial<IAgentConfig> {
  return {
    ...base,
    ...next,
    ...(base.subAgents || next.subAgents
      ? { subAgents: [...(base.subAgents ?? []), ...(next.subAgents ?? [])] }
      : {}),
  };
}

function validateAgentConfig(config: Partial<IAgentConfig>, context: string): asserts config is IAgentConfig {
  if (!config || typeof config !== 'object') {
    throw new Error(`[AiKit] ${context}: invalid agent config object`);
  }
  if (!config.id || typeof config.id !== 'string') {
    throw new Error(`[AiKit] ${context}: "id" must be a non-empty string`);
  }
  if (config.subAgents !== undefined && !Array.isArray(config.subAgents)) {
    throw new Error(`[AiKit] ${context}: "subAgents" must be an array`);
  }
}
