import { createDeepAgent, CreateDeepAgentParams } from 'deepagents';
import { Agent, IAgentConfig } from './agent';
import { ModelService } from '../models/model.service';
import { McpService } from '../services/mcp.service';
import { SubAgentService } from './sub-agent.service';
import { HitlService } from '../services/hitl.service';
import { MemoryService } from '../services/memory.service';
import { ISemanticMemoryAdapter } from '../interfaces/memory.interface';

/**
 * Factory interne : construit un `Agent` à partir d'une `IAgentConfig`.
 *
 * Résout les dépendances (modèle, outils MCP, sous-agents, HITL) et retourne
 * un objet `Agent` autonome qui encapsule toute la logique d'exécution.
 *
 * @internal Utilisé par AgentService — ne pas utiliser directement.
 */
export class AgentFactory {
  constructor(
    private readonly modelService: ModelService,
    private readonly mcpService: McpService,
    private readonly subAgentService: SubAgentService,
    private readonly hitlService: HitlService,
    private readonly memoryService: MemoryService,
  ) {}

  async create(config: IAgentConfig): Promise<Agent> {
    const model = this.modelService._getInternalModel(config.modelId);
    const tools = this.mcpService._getInternalTools(config.mcpServerIds);

    const subAgents =
      config.subAgents?.length
        ? this.subAgentService
            .compileSubAgents(config.subAgents)
            .map((c) => c._internal as any)
        : [];

    const interruptOn = this.hitlService._buildInterruptOn(config.hitl);
    const checkpointer = this.memoryService.getCheckpointer(config.memoryId);

    // Résoudre l'adaptateur sémantique si configuré
    let semanticAdapter: ISemanticMemoryAdapter | undefined;
    if (config.semanticMemory) {
      try {
        semanticAdapter = this.memoryService.resolveSemanticStore(
          config.semanticMemory.semanticMemoryId,
        );
      } catch {
        // Si l'adaptateur n'existe pas encore au moment de la création,
        // on laisse semanticAdapter undefined (pas d'injection)
      }
    }

    const params: CreateDeepAgentParams = {
      model: model as any,
      tools: tools as any[],
      subagents: subAgents,
      ...(config.systemPrompt ? { systemPrompt: config.systemPrompt } : {}),
      ...(interruptOn ? { interruptOn: interruptOn as any } : {}),
      ...(config.responseFormat ? { responseFormat: config.responseFormat as any } : {}),
      ...(config.extra as Record<string, unknown>),
    } as any;

    const internal = createDeepAgent(params as any);

    return new Agent(config.id, internal, checkpointer, this.hitlService, config, semanticAdapter);
  }
}
