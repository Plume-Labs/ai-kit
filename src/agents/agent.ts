import { DeepAgent } from 'deepagents';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { IHumanInTheLoopConfig } from '../interfaces/hitl.interface';
import { SubAgentDefinitionInput } from './sub-agent.interface';
import { HitlService } from '../services/hitl.service';
import { MemoryScope } from '../interfaces/memory.interface';
import { MemoryService } from '../services/memory.service';

// Fragments d'erreur émis par MemoryService pour indiquer une mémoire introuvable
// ou absente. Utilisés pour distinguer les erreurs "pas encore enregistrée" (ignorées)
// des erreurs de mauvaise configuration (re-lancées).
const MEMORY_NOT_FOUND_FRAGMENTS = ['Memoire introuvable', 'Aucune memoire configuree'] as const;

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
  /** ID de la mémoire a utiliser (sinon mémoire par défaut) */
  memoryId?: string;
  /** Sous-agents à déléguer */
  subAgents?: SubAgentDefinitionInput[];
  /** Configuration HITL */
  hitl?: IHumanInTheLoopConfig;
  /** Format de réponse structurée (schema JSON) */
  responseFormat?: Record<string, unknown>;
  /** Options supplémentaires deepagents */
  extra?: Record<string, unknown>;
  /**
   * Configuration de la mémoire sémantique long terme.
   * Si définie, les mémoires pertinentes sont recherchées avant chaque run
   * et injectées dans le contexte de l'agent.
   */
  semanticMemory?: {
    /**
     * ID de l'adaptateur sémantique dans MemoryService.
     * Doit correspondre à un ISemanticMemoryAdapter.
     */
    semanticMemoryId?: string;
    /** Nombre de mémoires à récupérer (défaut : 5) */
    topK?: number;
    /**
     * Si true (défaut), les mémoires sont injectées comme SystemMessage
     * dans les messages envoyés à l'agent.
     */
    includeInSystemPrompt?: boolean;
    /**
     * Scope d'isolation à appliquer lors de la recherche de mémoires.
     * Fusionné avec le `defaultScope` de l'adaptateur (le defaultScope prend la priorité).
     *
     * Permet d'affiner la recherche au-delà du scope par défaut de l'adaptateur,
     * par exemple pour cibler un projet ou un contexte spécifique.
     */
    scope?: MemoryScope;
  };
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
  private readonly memoryService: MemoryService;

  /** @internal Appelé uniquement par AgentFactory */
  constructor(
    id: string,
    internal: DeepAgent<any>,
    checkpointer: unknown,
    hitlService: HitlService,
    config: IAgentConfig,
    memoryService: MemoryService,
  ) {
    this.id = id;
    this._internal = internal;
    this.checkpointer = checkpointer;
    this.hitlService = hitlService;
    this.config = config;
    this.memoryService = memoryService;
  }

  /**
   * Exécute l'agent de façon synchrone et retourne le résultat final.
   */
  async run(opts: IAgentRunOptions): Promise<IAgentResult> {
    const threadId = opts.threadId ?? `thread-${Date.now()}`;
    const inputMessages =
      typeof opts.input === 'string'
        ? [new HumanMessage(opts.input)]
        : [new HumanMessage(JSON.stringify(opts.input))];

    const messages = await this.prependSemanticMemories(opts.input, threadId, inputMessages);

    const runConfig = {
      configurable: { thread_id: threadId },
      checkpointer: this.checkpointer,
    };

    const result = await this._internal.invoke(
      { messages } as any,
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
    const inputMessages =
      typeof opts.input === 'string'
        ? [new HumanMessage(opts.input)]
        : [new HumanMessage(JSON.stringify(opts.input))];

    const messages = await this.prependSemanticMemories(opts.input, threadId, inputMessages);

    const runConfig = {
      configurable: { thread_id: threadId },
      checkpointer: this.checkpointer,
    };

    try {
      for await (const chunk of await this._internal.stream(
        { messages } as any,
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

  /**
   * Si une mémoire sémantique est configurée, recherche les entrées pertinentes
   * et les prepend comme SystemMessage dans les messages envoyés a l'agent.
   *
   * La résolution de l'adaptateur est différée à l'exécution (lazy) pour
   * permettre l'enregistrement de la mémoire après la création de l'agent
   * (cas typique avec SemanticMemoryFactory.createAndRegister en onModuleInit).
   *
   * La recherche n'est PAS filtrée par threadId par défaut : la mémoire
   * sémantique est conçue pour la récupération long terme cross-thread.
   * Affinez avec `scope` pour l'isolation domaine/utilisateur/projet.
   */
  private async prependSemanticMemories(
    input: IAgentRunOptions['input'],
    _threadId: string,
    messages: unknown,
  ): Promise<unknown> {
    const semanticCfg = this.config.semanticMemory;
    if (!semanticCfg || semanticCfg.includeInSystemPrompt === false || !Array.isArray(messages)) {
      return messages;
    }

    let semanticAdapter;
    try {
      semanticAdapter = this.memoryService.resolveSemanticStore(semanticCfg.semanticMemoryId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Ignorer silencieusement uniquement si la mémoire n'est pas encore enregistrée
      // (cas typique : onModuleInit pas encore exécuté). Re-lancer les erreurs de configuration
      // incorrecte (ex : adaptateur non sémantique).
      if (MEMORY_NOT_FOUND_FRAGMENTS.some((fragment) => msg.includes(fragment))) {
        return messages;
      }
      throw err;
    }

    const query = typeof input === 'string' ? input : JSON.stringify(input);
    const memories = await semanticAdapter.search(query, {
      k: semanticCfg.topK ?? 5,
      scope: semanticCfg.scope,
    });

    if (memories.length === 0) {
      return messages;
    }

    const memoryBlock = memories.map((m) => m.content).join('\n---\n');
    const memoryMessage = new SystemMessage(
      `<relevant_memories>\n${memoryBlock}\n</relevant_memories>`,
    );

    return [memoryMessage, ...messages];
  }
}
