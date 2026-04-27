import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  Agent,
  IAgentResult,
  IAgentRunOptions,
  IAgentStreamEvent,
} from './agent';
import { AgentDefinitionInput, resolveAgentDefinitionInput } from './agent.definition';
import { AgentFactory } from './agent.factory';
import { ModelService } from '../models/model.service';
import { McpService } from '../services/mcp.service';
import { SubAgentService } from './sub-agent.service';
import { HitlService } from '../services/hitl.service';
import { MemoryService } from '../services/memory.service';
import { ToolSelectorService } from '../services/tool-selector.service';
import { AiKitModuleOptions } from '../module/ai-kit.config';
import { AI_KIT_OPTIONS } from '../module/ai-kit.tokens';

/**
 * Service de gestion des agents.
 *
 * Maintient un registre d'objets `Agent` et délègue entièrement
 * la logique d'exécution à chaque instance via `agent.run()` / `agent.stream()`.
 * La construction des agents est assurée par `AgentFactory`.
 */
@Injectable()
export class AgentService implements OnModuleInit {
  private readonly logger = new Logger(AgentService.name);
  private readonly registry = new Map<string, Agent>();
  private readonly factory: AgentFactory;

  constructor(
    @Inject(AI_KIT_OPTIONS)
    private readonly options: AiKitModuleOptions,
    modelService: ModelService,
    mcpService: McpService,
    subAgentService: SubAgentService,
    hitlService: HitlService,
    memoryService: MemoryService,
    toolSelectorService: ToolSelectorService,
  ) {
    this.factory = new AgentFactory(
      modelService,
      mcpService,
      subAgentService,
      hitlService,
      memoryService,
      toolSelectorService,
    );
  }

  async onModuleInit(): Promise<void> {
    await this.registerAgents(this.options.agents ?? []);
  }

  // ─── Enregistrement ───────────────────────────────────────────────────────

  /**
   * Enregistre plusieurs agents en lot.
   */
  async registerAgents(
    configs: AgentDefinitionInput[],
    opts?: { overwrite?: boolean },
  ): Promise<Agent[]> {
    return Promise.all(configs.map((c) => this.registerAgent(c, opts)));
  }

  /**
   * Enregistre un agent à partir de sa configuration.
   * Retourne l'objet `Agent` prêt à l'exécution.
   *
   * La configuration globale `AiKitModuleOptions.toolSelection` est fusionnée
   * avec la configuration locale de l'agent (la config agent a la priorité).
   */
  async registerAgent(
    input: AgentDefinitionInput,
    opts?: { overwrite?: boolean },
  ): Promise<Agent> {
    const config = resolveAgentDefinitionInput(input);

    if (this.registry.has(config.id) && !opts?.overwrite) {
      return this.registry.get(config.id)!;
    }

    // Fusionner la config globale toolSelection avec la config agent (agent a la priorité)
    const globalToolSelection = this.options.toolSelection;
    const resolvedConfig =
      globalToolSelection || config.toolSelection
        ? {
            ...config,
            toolSelection: {
              ...(globalToolSelection ?? {}),
              ...(config.toolSelection ?? {}),
            },
          }
        : config;

    const agent = await this.factory.create(resolvedConfig);
    this.registry.set(agent.id, agent);
    this.logger.log(`[AiKit] Agent enregistré : ${agent.id}`);
    return agent;
  }

  // ─── Résolution ───────────────────────────────────────────────────────────

  /**
   * Résout un agent par son id ou en retournant directement l'objet fourni.
   * Lève une erreur si l'agent est introuvable.
   */
  resolve(idOrAgent: string | Agent): Agent {
    const id = typeof idOrAgent === 'string' ? idOrAgent : idOrAgent.id;
    const agent = this.registry.get(id);
    if (!agent) throw new Error(`[AiKit] Agent introuvable : ${id}`);
    return agent;
  }

  // ─── Exécution (délégation à l'objet Agent) ───────────────────────────────

  /**
   * Exécute un agent de façon synchrone.
   */
  run(idOrAgent: string | Agent, opts: IAgentRunOptions): Promise<IAgentResult> {
    return this.resolve(idOrAgent).run(opts);
  }

  /**
   * Exécute un agent en mode streaming.
   */
  stream(
    idOrAgent: string | Agent,
    opts: IAgentRunOptions,
  ): AsyncIterable<IAgentStreamEvent> {
    return this.resolve(idOrAgent).stream(opts);
  }

  /**
   * Reprend l'exécution d'un agent après une interruption HITL.
   */
  resumeAfterInterrupt(
    idOrAgent: string | Agent,
    threadId: string,
    updatedInput?: Record<string, unknown>,
  ): Promise<IAgentResult> {
    return this.resolve(idOrAgent).resumeAfterInterrupt(threadId, updatedInput);
  }

  // ─── Listing ──────────────────────────────────────────────────────────────

  /**
   * Retourne tous les agents enregistrés.
   */
  listAgents(): Agent[] {
    return Array.from(this.registry.values());
  }
}
