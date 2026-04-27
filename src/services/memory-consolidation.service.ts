import { Injectable } from '@nestjs/common';
import { BaseMessage } from '@langchain/core/messages';
import { ConsolidatedMemoryEntry, MemoryScope } from '../interfaces/memory.interface';
import { MemoryService } from './memory.service';
import { ModelService } from '../models/model.service';

/**
 * Options de consolidation d'une conversation.
 */
export interface IConsolidationOptions {
  /**
   * Messages de la conversation a consolider.
   * Typiquement les IAgentMessage issus d'un IAgentResult.messages,
   * ou des objets LangChain BaseMessage.
   */
  messages: Array<{ role: string; content: string | unknown } | BaseMessage>;

  /**
   * Identifiant du thread source (stocké dans la mémoire consolidée).
   */
  threadId?: string;

  /**
   * Identifiant de l'utilisateur (stocké dans la mémoire consolidée).
   */
  userId?: string;

  /**
   * ID de la mémoire sémantique cible dans MemoryService.
   * Si absent, utilise la mémoire par défaut (qui doit etre sémantique).
   */
  semanticMemoryId?: string;

  /**
   * ID du modèle a utiliser pour generer le résumé.
   * Si absent, utilise le modèle par défaut de ModelService.
   */
  modelId?: string;

  /**
   * Métadonnées supplémentaires à stocker avec l'entrée.
   */
  metadata?: Record<string, unknown>;

  /**
   * Scope d'isolation à appliquer à l'entrée consolidée.
   * Fusionné avec le `defaultScope` de l'adaptateur sémantique cible.
   *
   * Exemple (Neura / CQRS) :
   * ```ts
   * await consolidationService.consolidate({
   *   messages: result.messages ?? [],
   *   threadId: 't1',
   *   scope: { domain: 'billing', projectId: 'proj-42' },
   *   semanticMemoryId: 'pgvec',
   * });
   * ```
   */
  scope?: MemoryScope;
}

/**
 * Service d'orchestration de la consolidation de mémoire.
 *
 * Pipeline :
 *  1. Recevoir les messages d'une conversation terminée.
 *  2. Appeler le LLM (via ModelService) pour en extraire les faits clés.
 *  3. Stocker le résumé + son embedding dans un ISemanticMemoryAdapter.
 *
 * La mémoire consolidée peut ensuite etre injectée dans le system prompt
 * des prochains runs via IAgentConfig.semanticMemory.
 *
 * Usage typique :
 * ```ts
 * const result = await agentService.run('my-agent', { input: '...', threadId: 't1' });
 *
 * await consolidationService.consolidate({
 *   messages: result.messages ?? [],
 *   threadId: 't1',
 *   userId:   'user-42',
 *   semanticMemoryId: 'pgvec',
 * });
 * ```
 */
@Injectable()
export class MemoryConsolidationService {
  constructor(
    private readonly memoryService: MemoryService,
    private readonly modelService: ModelService,
  ) {}

  /**
   * Consolide une conversation en un résumé sémantique persistant.
   *
   * @returns L'entrée créée dans le backend sémantique.
   */
  async consolidate(opts: IConsolidationOptions): Promise<ConsolidatedMemoryEntry> {
    const semanticAdapter = this.memoryService.resolveSemanticStore(opts.semanticMemoryId);

    const conversationText = this.formatMessages(opts.messages);
    const summary = await this.summarize(conversationText, opts.modelId);

    return semanticAdapter.store({
      threadId: opts.threadId,
      userId: opts.userId,
      content: summary,
      scope: opts.scope,
      metadata: {
        ...(opts.metadata ?? {}),
        consolidatedAt: new Date().toISOString(),
        messageCount: opts.messages.length,
      },
    });
  }

  // ─── Helpers privés ──────────────────────────────────────────────────────────

  private formatMessages(
    messages: Array<{ role: string; content: string | unknown } | BaseMessage>,
  ): string {
    const safeStringify = (val: unknown): string => {
      try {
        return JSON.stringify(val);
      } catch {
        return String(val);
      }
    };
    return messages
      .map((m) => {
        if (this.isBaseMessage(m)) {
          const role = m._getType?.() ?? 'unknown';
          const content = typeof m.content === 'string' ? m.content : safeStringify(m.content);
          return `${role}: ${content}`;
        }
        const content = typeof m.content === 'string' ? m.content : safeStringify(m.content);
        return `${m.role}: ${content}`;
      })
      .join('\n');
  }

  private isBaseMessage(m: unknown): m is BaseMessage {
    return typeof (m as any)?._getType === 'function';
  }

  private async summarize(conversationText: string, modelId?: string): Promise<string> {
    const model = this.modelService._getInternalModel(modelId);

    const { HumanMessage, SystemMessage } = await import('@langchain/core/messages');

    const response = await model.invoke([
      new SystemMessage(
        'Tu es un assistant specialise dans la synthese de conversations. ' +
          'Extrais les faits cles, decisions et informations importantes de la conversation suivante. ' +
          'Sois concis et factuel. Reponds uniquement avec le resume, sans introduction.',
      ),
      new HumanMessage(`Conversation a consolider :\n\n${conversationText}`),
    ]);

    const content = response.content;
    return typeof content === 'string' ? content : JSON.stringify(content);
  }
}
