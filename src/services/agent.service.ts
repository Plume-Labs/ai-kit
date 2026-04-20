import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createDeepAgent, DeepAgent } from 'deepagents';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import {
  IAgent,
  IAgentConfig,
  IAgentResult,
  IAgentRunOptions,
  IAgentStreamEvent,
} from '../interfaces/agent.interface';
import { ModelService } from './model.service';
import { McpService } from './mcp.service';
import { SubAgentService } from './sub-agent.service';
import { HitlService } from './hitl.service';
import { AiKitModuleOptions } from '../module/ai-kit.config';
import { AI_KIT_OPTIONS } from '../module/ai-kit.tokens';

/**
 * Service principal de gestion des agents.
 * Abstraction complète sur deepagents — les utilisateurs ne voient que IAgent / IAgentResult.
 */
@Injectable()
export class AgentService implements OnModuleInit {
  private readonly logger = new Logger(AgentService.name);
  private readonly agentRegistry = new Map<string, DeepAgent<any>>();
  private readonly configRegistry = new Map<string, IAgentConfig>();
  private checkpointer: MemorySaver;

  constructor(
    @Inject(AI_KIT_OPTIONS)
    private readonly options: AiKitModuleOptions,
    private readonly modelService: ModelService,
    private readonly mcpService: McpService,
    private readonly subAgentService: SubAgentService,
    private readonly hitlService: HitlService,
  ) {
    // Utiliser le checkpointer fourni ou un InMemorySaver par défaut
    this.checkpointer = (options.checkpointer as MemorySaver) ?? new MemorySaver();
  }

  async onModuleInit(): Promise<void> {
    await this.registerAgents(this.options.agents ?? []);
  }

  /**
   * Enregistre dynamiquement plusieurs agents.
   */
  async registerAgents(
    configs: IAgentConfig[],
    options?: { overwrite?: boolean },
  ): Promise<IAgent[]> {
    const agents: IAgent[] = [];
    for (const config of configs) {
      agents.push(await this.registerAgent(config, options));
    }
    return agents;
  }

  /**
   * Enregistre dynamiquement un agent à partir d'une IAgentConfig.
   * Retourne un IAgent opaque utilisable pour les appels.
   */
  async registerAgent(
    config: IAgentConfig,
    options?: { overwrite?: boolean },
  ): Promise<IAgent> {
    if (this.agentRegistry.has(config.id) && !options?.overwrite) {
      return { id: config.id, _internal: this.agentRegistry.get(config.id) };
    }

    const model = this.modelService._getInternalModel(config.modelId);
    const tools = this.mcpService._getInternalTools(config.mcpServerIds);

    // Compiler les sous-agents
    const subAgents =
      config.subAgents && config.subAgents.length > 0
        ? this.subAgentService
            .compileSubAgents(config.subAgents)
            .map((c) => c._internal as any)
        : [];

    const interruptOn = this.hitlService._buildInterruptOn(config.hitl);

    const deepAgent = createDeepAgent({
      model: model as any,
      tools: tools as any[],
      subagents: subAgents,
      ...(config.systemPrompt ? { systemPrompt: config.systemPrompt } : {}),
      ...(interruptOn ? { interruptOn: interruptOn as any } : {}),
      ...(config.responseFormat ? { responseFormat: config.responseFormat as any } : {}),
      ...(config.extra as Record<string, unknown>),
    } as any);

    this.agentRegistry.set(config.id, deepAgent);
    this.configRegistry.set(config.id, config);
    this.logger.log(`[AiKit] Agent enregistré : ${config.id}`);

    return { id: config.id, _internal: deepAgent };
  }

  /**
   * Exécute un agent de façon synchrone et retourne IAgentResult.
   */
  async run(agentIdOrAgent: string | IAgent, opts: IAgentRunOptions): Promise<IAgentResult> {
    const agent = this.resolveDeepAgent(agentIdOrAgent);
    const threadId = opts.threadId ?? `thread-${Date.now()}`;
    const input =
      typeof opts.input === 'string'
        ? [new HumanMessage(opts.input)]
        : opts.input;

    const config = {
      configurable: { thread_id: threadId },
      ...(this.checkpointer ? { checkpointer: this.checkpointer } : {}),
    };

    const result = await agent.invoke({ messages: input } as any, config as any);

    const lastMessage = Array.isArray(result?.messages)
      ? result.messages[result.messages.length - 1]
      : null;

    return {
      output: lastMessage?.content ?? result,
      messages: Array.isArray(result?.messages)
        ? result.messages.map((m: any) => ({
            role: m._getType?.() ?? 'ai',
            content: m.content,
          }))
        : undefined,
      meta: { threadId },
    };
  }

  /**
   * Exécute un agent en mode streaming.
   * Retourne un AsyncIterable d'IAgentStreamEvent.
   */
  async *stream(
    agentIdOrAgent: string | IAgent,
    opts: IAgentRunOptions,
  ): AsyncIterable<IAgentStreamEvent> {
    const agent = this.resolveDeepAgent(agentIdOrAgent);
    const threadId = opts.threadId ?? `thread-${Date.now()}`;
    const input =
      typeof opts.input === 'string'
        ? [new HumanMessage(opts.input)]
        : opts.input;

    const config = {
      configurable: { thread_id: threadId },
      ...(this.checkpointer ? { checkpointer: this.checkpointer } : {}),
    };

    try {
      for await (const chunk of await agent.stream(
        { messages: input } as any,
        { ...config, streamMode: 'updates' } as any,
      )) {
        yield { type: 'text', data: chunk };
      }
      yield { type: 'done', data: null };
    } catch (err: any) {
      // Détecter une interruption LangGraph
      if (err?.name === 'GraphInterrupt' || err?.message?.includes('interrupt')) {
        const toolName = err.toolName ?? 'unknown';
        const decision = await this.hitlService.waitForHumanDecision({
          threadId,
          toolName,
          toolInput: err.toolInput ?? {},
        });
        yield { type: 'interrupt', data: { threadId, toolName, decision } };
      } else {
        yield { type: 'error', data: err?.message ?? String(err) };
      }
    }
  }

  /**
   * Reprend l'exécution d'un agent après une interruption HITL.
   */
  async resumeAfterInterrupt(
    agentIdOrAgent: string | IAgent,
    threadId: string,
    updatedInput?: Record<string, unknown>,
  ): Promise<IAgentResult> {
    const agent = this.resolveDeepAgent(agentIdOrAgent);
    const config = {
      configurable: { thread_id: threadId },
      ...(this.checkpointer ? { checkpointer: this.checkpointer } : {}),
    };
    const resumeValue = updatedInput ? { messages: [new HumanMessage(JSON.stringify(updatedInput))] } : null;
    const result = await agent.invoke(resumeValue as any, config as any);
    return {
      output: result?.messages?.[result.messages.length - 1]?.content ?? result,
      meta: { threadId },
    };
  }

  /**
   * Retourne la liste des agents enregistrés.
   */
  listAgents(): IAgent[] {
    return Array.from(this.agentRegistry.entries()).map(([id, internal]) => ({
      id,
      _internal: internal,
    }));
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private resolveDeepAgent(agentIdOrAgent: string | IAgent): DeepAgent<any> {
    const id = typeof agentIdOrAgent === 'string' ? agentIdOrAgent : agentIdOrAgent.id;
    const agent = this.agentRegistry.get(id);
    if (!agent) throw new Error(`[AiKit] Agent introuvable : ${id}`);
    return agent;
  }
}
