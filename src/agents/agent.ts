import { DeepAgent } from 'deepagents';
import { HumanMessage } from '@langchain/core/messages';
import { IHumanInTheLoopConfig } from '../interfaces/hitl.interface';
import { ISubAgentSpec } from './sub-agent.interface';
import { HitlService } from '../services/hitl.service';

// ─── Interfaces publiques ─────────────────────────────────────────────────────

/**
 * Options d'exécution d'un agent.
 */
export interface IAgentRunOptions {
  /** Identifiant de thread pour la mémoire et la reprise HITL */
  threadId?: string;
  /** Entrée textuelle ou structurée */
  input: string | Record<string, unknown>;
  /** Streaming activé ? */
  stream?: boolean;
  /** Valeurs de contexte supplémentaires */
  context?: Record<string, unknown>;
}

/**
 * Résultat d'une exécution d'agent.
 */
export interface IAgentResult {
  /** Réponse finale de l'agent */
  output: string | Record<string, unknown>;
  /** Messages échangés pendant l'exécution */
  messages?: IAgentMessage[];
  /** Metadata (durée, tokens, etc.) */
  meta?: Record<string, unknown>;
}

/**
 * Message dans la conversation agent.
 */
export interface IAgentMessage {
  role: 'human' | 'ai' | 'tool' | 'system';
  content: string | Record<string, unknown>;
  toolCallId?: string;
  toolName?: string;
}

/**
 * Événement streamed lors d'une exécution.
 */
export interface IAgentStreamEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'interrupt' | 'done' | 'error';
  data: unknown;
}

/**
 * Configuration d'un agent personnalisable.
 */
export interface IAgentConfig {
  /** Identifiant unique de l'agent dans le module */
  id: string;
  /** ID du modèle enregistré dans ModelService (optionnel, utilise le défaut sinon) */
  modelId?: string;
  /** Prompt système */
  systemPrompt?: string;
  /** IDs des serveurs MCP à utiliser */
  mcpServerIds?: string[];
  /** ID de la memoire a utiliser (sinon memoire par defaut) */
  memoryId?: string;
  /** Sous-agents à déléguer */
  subAgents?: ISubAgentSpec[];
  /** Configuration HITL */
  hitl?: IHumanInTheLoopConfig;
  /** Format de réponse structurée (schema JSON) */
  responseFormat?: Record<string, unknown>;
  /** Options supplémentaires deepagents */
  extra?: Record<string, unknown>;
}

// ─── Classe Agent ─────────────────────────────────────────────────────────────

/**
 * Représente un agent prêt à l'exécution.
 *
 * Construit via `AgentFactory.create()` — ne pas instancier directement.
 * Encapsule le DeepAgent interne et expose une API de haut niveau :
 * `run()`, `stream()`, `resumeAfterInterrupt()`.
 */
export class Agent {
  readonly id: string;

  /** Configuration source de l'agent */
  readonly config: IAgentConfig;

  /** @internal Objet interne deepagents — ne pas utiliser directement */
  private readonly _internal: DeepAgent<any>;

  private readonly checkpointer: unknown;
  private readonly hitlService: HitlService;

  /** @internal Appelé uniquement par AgentFactory */
  constructor(
    id: string,
    internal: DeepAgent<any>,
    checkpointer: unknown,
    hitlService: HitlService,
    config: IAgentConfig,
  ) {
    this.id = id;
    this._internal = internal;
    this.checkpointer = checkpointer;
    this.hitlService = hitlService;
    this.config = config;
  }

  /**
   * Exécute l'agent de façon synchrone et retourne le résultat final.
   */
  async run(opts: IAgentRunOptions): Promise<IAgentResult> {
    const threadId = opts.threadId ?? `thread-${Date.now()}`;
    const input =
      typeof opts.input === 'string' ? [new HumanMessage(opts.input)] : opts.input;

    const runConfig = {
      configurable: { thread_id: threadId },
      checkpointer: this.checkpointer,
    };

    const result = await this._internal.invoke(
      { messages: input } as any,
      runConfig as any,
    );

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
   * Exécute l'agent en mode streaming.
   * Retourne un AsyncIterable d'IAgentStreamEvent.
   */
  async *stream(opts: IAgentRunOptions): AsyncIterable<IAgentStreamEvent> {
    const threadId = opts.threadId ?? `thread-${Date.now()}`;
    const input =
      typeof opts.input === 'string' ? [new HumanMessage(opts.input)] : opts.input;

    const runConfig = {
      configurable: { thread_id: threadId },
      checkpointer: this.checkpointer,
    };

    try {
      for await (const chunk of await this._internal.stream(
        { messages: input } as any,
        { ...runConfig, streamMode: 'updates' } as any,
      )) {
        yield { type: 'text', data: chunk };
      }
      yield { type: 'done', data: null };
    } catch (err: any) {
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
   * Reprend l'exécution après une interruption HITL.
   *
   * @param threadId       Thread interrompu
   * @param updatedInput   Paramètres modifiés par l'humain (optionnel)
   */
  async resumeAfterInterrupt(
    threadId: string,
    updatedInput?: Record<string, unknown>,
  ): Promise<IAgentResult> {
    const runConfig = {
      configurable: { thread_id: threadId },
      checkpointer: this.checkpointer,
    };
    const resumeValue = updatedInput
      ? { messages: [new HumanMessage(JSON.stringify(updatedInput))] }
      : null;

    const result = await this._internal.invoke(resumeValue as any, runConfig as any);
    return {
      output: result?.messages?.[result.messages.length - 1]?.content ?? result,
      meta: { threadId },
    };
  }
}
