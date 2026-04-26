import { Injectable } from '@nestjs/common';
import { BaseMessage } from '@langchain/core/messages';
import { ConsolidatedMemoryEntry } from '../interfaces/memory.interface';
import { ISemanticMemoryAdapter } from '../interfaces/memory.interface';
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
   * Identifiant du thread source (stocke dans la memoire consolidee).
   */
  threadId?: string;

  /**
   * Identifiant de l'utilisateur (stocke dans la memoire consolidee).
   */
  userId?: string;

  /**
   * ID de la memoire semantique cible dans MemoryService.
   * Si absent, utilise la memoire par defaut (qui doit etre semantique).
   */
  semanticMemoryId?: string;

  /**
   * ID du modele a utiliser pour generer le resume.
   * Si absent, utilise le modele par defaut de ModelService.
   */
  modelId?: string;

  /**
   * Metadonnees supplementaires a stocker avec l'entree.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Service d'orchestration de la consolidation de memoire.
 *
 * Pipeline :
 *  1. Recevoir les messages d'une conversation terminee.
 *  2. Appeler le LLM (via ModelService) pour en extraire les faits cles.
 *  3. Stocker le resume + son embedding dans un ISemanticMemoryAdapter.
 *
 * La memoire consolidee peut ensuite etre injectee dans le system prompt
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
   * Consolide une conversation en un resume semantique persistant.
   *
   * @returns L'entree creee dans le backend semantique.
   */
  async consolidate(opts: IConsolidationOptions): Promise<ConsolidatedMemoryEntry> {
    const semanticAdapter = this.memoryService.resolveSemanticStore(opts.semanticMemoryId);

    const conversationText = this.formatMessages(opts.messages);
    const summary = await this.summarize(conversationText, opts.modelId);

    return semanticAdapter.store({
      threadId: opts.threadId,
      userId: opts.userId,
      content: summary,
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
    return messages
      .map((m) => {
        if (this.isBaseMessage(m)) {
          const role = m._getType?.() ?? 'unknown';
          const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          return `${role}: ${content}`;
        }
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
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
