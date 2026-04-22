import { Injectable, Logger } from '@nestjs/common';
import { SubAgent, CompiledSubAgent, AsyncSubAgent } from 'deepagents';
import {
  ISubAgentSpec,
  ICompiledSubAgent,
  SubAgentDefinitionInput,
} from './sub-agent.interface';
import { ModelService } from '../models/model.service';
import {
  getSubAgentDefinitionMetadata,
  isSubAgentDefinitionClass,
} from './sub-agent.definition';

/**
 * Service de gestion des sous-agents.
 * Traduit ISubAgentSpec → SubAgent / AsyncSubAgent deepagents.
 * Les utilisateurs ne manipulent jamais les types deepagents directement.
 */
@Injectable()
export class SubAgentService {
  private readonly logger = new Logger(SubAgentService.name);
  private readonly registry = new Map<string, ICompiledSubAgent>();

  constructor(private readonly modelService: ModelService) {}

  /**
   * Compile un ISubAgentSpec en ICompiledSubAgent.
   * Met en cache le résultat par nom.
   */
  compileSubAgent(input: SubAgentDefinitionInput): ICompiledSubAgent {
    const spec = this.normalizeSpec(input);

    if (this.registry.has(spec.name)) {
      return this.registry.get(spec.name)!;
    }

    let internal: SubAgent | AsyncSubAgent;

    if (spec.graphId) {
      // Sous-agent asynchrone distant (LangGraph Cloud / ACP)
      internal = {
        name: spec.name,
        description: spec.description,
        graphId: spec.graphId,
        ...(spec.remoteUrl ? { url: spec.remoteUrl } : {}),
      } as AsyncSubAgent;
    } else {
      // Sous-agent synchrone local
      const model = spec.modelId
        ? this.modelService._getInternalModel(spec.modelId)
        : undefined;

      const subAgent: SubAgent = {
        name: spec.name,
        description: spec.description,
        systemPrompt: spec.systemPrompt ?? '',
        ...(model ? { model: model as any } : {}),
        ...(spec.hitl?.interruptOn
          ? { interruptOn: spec.hitl.interruptOn as Record<string, boolean> }
          : {}),
      };
      internal = subAgent;
    }

    const compiled: ICompiledSubAgent = {
      name: spec.name,
      _internal: internal,
    };

    this.registry.set(spec.name, compiled);
    this.logger.debug(`[AiKit] Sous-agent compilé : ${spec.name}`);
    return compiled;
  }

  /**
   * Compile plusieurs specs d'un coup.
   */
  compileSubAgents(specs: SubAgentDefinitionInput[]): ICompiledSubAgent[] {
    return specs.map((s) => this.compileSubAgent(s));
  }

  private normalizeSpec(input: SubAgentDefinitionInput): ISubAgentSpec {
    if (isSubAgentDefinitionClass(input)) {
      const metadata = getSubAgentDefinitionMetadata(input);
      if (!metadata) {
        throw new Error(
          `[AiKit] Sous-agent introuvable pour la classe "${input.name || 'AnonymousClass'}": utilisez @SubAgentDefinition(...)`,
        );
      }
      this.assertSpec(metadata, `Classe ${input.name || 'AnonymousClass'}`);
      return metadata;
    }

    this.assertSpec(input, 'Spec');
    return input;
  }

  private assertSpec(spec: ISubAgentSpec, context: string): void {
    if (!spec?.name || typeof spec.name !== 'string') {
      throw new Error(`[AiKit] ${context}: "name" de sous-agent invalide`);
    }
    if (!spec.description || typeof spec.description !== 'string') {
      throw new Error(`[AiKit] ${context}: "description" de sous-agent invalide`);
    }
  }

  /**
   * Retourne tous les sous-agents enregistrés.
   */
  listSubAgents(): ICompiledSubAgent[] {
    return Array.from(this.registry.values());
  }

  /**
   * @internal Retourne les objets natifs deepagents pour injection dans createDeepAgent.
   */
  _getInternalSubAgents(names: string[]): (SubAgent | CompiledSubAgent | AsyncSubAgent)[] {
    return names
      .map((n) => this.registry.get(n)?._internal)
      .filter(Boolean) as (SubAgent | AsyncSubAgent)[];
  }
}
