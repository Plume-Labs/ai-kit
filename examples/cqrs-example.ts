/**
 * Exemple CQRS multi-domaine — Architecture complète
 *
 * Illustre comment structurer une application NestJS en bounded contexts
 * indépendants, chacun avec ses propres agents, sous-agents, mémoires et graphes.
 *
 * Architecture :
 *   AppModule
 *   ├── BillingModule    (domaine facturation — agents + mémoire sémantique isolée)
 *   └── SupportModule    (domaine support   — orchestrateur + sous-agents + graphe)
 *
 * Points clés :
 * - Un @SemanticMemoryDefinition par domaine  → isolation stricte par defaultScope
 * - Un AiKitModule.forFeature() par module    → enregistrement additif dans les services globaux
 * - @InjectAgent / @InjectAgentGraph          → injection directe des objets domaine dans les services
 * - SemanticMemoryFactory.createAndRegister() → initialisation lazy en onModuleInit (après la création des agents)
 * - MemoryConsolidationService                → consolidation LLM → pgvector après chaque run
 */

import {
  Injectable,
  Module,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OpenAIEmbeddings } from '@langchain/openai';

import {
  // Module
  AiKitModule,
  // Décorateurs de définition
  AgentDefinition,
  SubAgentDefinition,
  UsesSubAgents,
  SemanticMemoryDefinition,
  // Injection
  InjectAgent,
  InjectAgentGraph,
  // Factory mémoire
  SemanticMemoryFactory,
  // Service de consolidation
  MemoryConsolidationService,
  // Types
  Agent,
  AgentGraph,
} from 'ai-kit';

// ─── 1. Définitions du domaine Facturation ────────────────────────────────────

/**
 * Mémoire sémantique isolée pour le domaine Facturation.
 *
 * defaultScope garantit que seules les données de facturation sont
 * lues/écrites, quel que soit le code appelant.
 */
@SemanticMemoryDefinition({
  id: 'billing-memory',
  tableName: 'ai_memories_billing',
  defaultScope: { domain: 'billing', enterpriseId: 'ent-1' },
})
export class BillingMemory {}

/**
 * Agent de vérification de factures.
 * Il a accès à la mémoire sémantique de facturation pour enrichir ses
 * réponses avec le contexte des conversations précédentes.
 */
@AgentDefinition({
  id: 'billing-agent',
  modelId: 'gpt4o',
  systemPrompt: 'Tu es un expert en facturation. Analyse et vérifie les factures.',
  semanticMemory: {
    semanticMemoryId: 'billing-memory',
    topK: 5,
    scope: { domain: 'billing' },
  },
})
export class BillingAgent {}

// ─── 2. Module Facturation ────────────────────────────────────────────────────

@Injectable()
export class BillingService implements OnModuleInit {
  constructor(
    // Injection directe de l'agent déclaré dans forFeature()
    @InjectAgent('billing-agent')
    private readonly billingAgent: Agent,

    // SemanticMemoryFactory est globalement injectable (ALL_SERVICES)
    private readonly semanticMemoryFactory: SemanticMemoryFactory,

    // MemoryConsolidationService est globalement injectable (ALL_SERVICES)
    private readonly consolidationService: MemoryConsolidationService,

    // DataSource TypeORM — fourni par le module consommateur
    private readonly dataSource: DataSource,

    // Provider d'embeddings — fourni par le module consommateur
    private readonly embeddings: OpenAIEmbeddings,
  ) {}

  /**
   * Initialise la mémoire sémantique du domaine Facturation.
   *
   * createAndRegister() :
   *   1. Crée la table + les indexes pgvector si nécessaire (idempotent)
   *   2. Enregistre l'adaptateur dans MemoryService sous l'id 'billing-memory'
   */
  async onModuleInit(): Promise<void> {
    await this.semanticMemoryFactory.createAndRegister(BillingMemory, {
      dataSource: this.dataSource,
      embeddings: this.embeddings,
    });
  }

  /**
   * Traite une requête de facturation et consolide la conversation.
   */
  async processInvoice(invoiceId: string, userId: string): Promise<string> {
    const threadId = `billing-${userId}-${invoiceId}`;

    // Exécution de l'agent (les mémoires pertinentes sont injectées automatiquement)
    const result = await this.billingAgent.run({
      input: `Vérifie la facture ${invoiceId}`,
      threadId,
    });

    // Consolidation de la conversation dans la mémoire sémantique
    await this.consolidationService.consolidate({
      messages: result.messages ?? [],
      threadId,
      userId,
      scope: { domain: 'billing', enterpriseId: 'ent-1' },
      semanticMemoryId: 'billing-memory',
    });

    return String(result.output);
  }
}

@Module({
  imports: [
    AiKitModule.forFeature({
      agents: [BillingAgent],
    }),
  ],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}

// ─── 3. Définitions du domaine Support ───────────────────────────────────────

/**
 * Mémoire sémantique isolée pour le domaine Support client.
 * Stockée dans une table séparée, cloisonnée par le defaultScope.
 */
@SemanticMemoryDefinition({
  id: 'support-memory',
  tableName: 'ai_memories_support',
  defaultScope: { domain: 'support', enterpriseId: 'ent-1' },
})
export class SupportMemory {}

/**
 * Sous-agent spécialisé dans la recherche documentaire.
 */
@SubAgentDefinition({
  name: 'doc-searcher',
  description: 'Recherche dans la base documentaire pour trouver des informations techniques.',
  modelId: 'gpt4o',
})
export class DocSearcherSubAgent {}

/**
 * Sous-agent spécialisé dans la résolution d'incidents.
 */
@SubAgentDefinition({
  name: 'incident-resolver',
  description: 'Propose des solutions aux incidents signalés par les utilisateurs.',
  modelId: 'gpt4o',
})
export class IncidentResolverSubAgent {}

/**
 * Agent orchestrateur du support.
 * Délègue à DocSearcher et IncidentResolver selon la nature de la requête.
 */
@AgentDefinition({
  id: 'support-orchestrator',
  modelId: 'gpt4o',
  systemPrompt: 'Tu es le coordinateur du support. Tu délègues aux experts appropriés.',
  semanticMemory: {
    semanticMemoryId: 'support-memory',
    topK: 3,
    scope: { domain: 'support' },
  },
})
@UsesSubAgents([DocSearcherSubAgent, IncidentResolverSubAgent])
export class SupportOrchestratorAgent {}

/**
 * Agent de qualification des tickets.
 */
@AgentDefinition({
  id: 'ticket-qualifier',
  modelId: 'gpt4o',
  systemPrompt: 'Tu qualifies les tickets : priorité, catégorie, domaine concerné.',
})
export class TicketQualifierAgent {}

// ─── 4. Graphe du pipeline support ───────────────────────────────────────────

/**
 * Pipeline : qualification → orchestration → réponse.
 */
export const supportPipeline = {
  id: 'support-pipeline',
  entryNodeId: 'qualify',
  nodes: [
    { id: 'qualify',      agentId: 'ticket-qualifier' },
    { id: 'orchestrate',  agentId: 'support-orchestrator' },
  ],
  edges: [
    { from: 'qualify', to: 'orchestrate' },
  ],
};

// ─── 5. Module Support ────────────────────────────────────────────────────────

@Injectable()
export class SupportService implements OnModuleInit {
  constructor(
    // Injection du graphe déclaré dans forFeature()
    @InjectAgentGraph('support-pipeline')
    private readonly pipeline: AgentGraph,

    private readonly semanticMemoryFactory: SemanticMemoryFactory,
    private readonly consolidationService: MemoryConsolidationService,
    private readonly dataSource: DataSource,
    private readonly embeddings: OpenAIEmbeddings,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.semanticMemoryFactory.createAndRegister(SupportMemory, {
      dataSource: this.dataSource,
      embeddings: this.embeddings,
    });
  }

  /**
   * Traite un ticket support à travers le pipeline complet.
   */
  async handleTicket(ticketId: string, userId: string, description: string): Promise<string> {
    const threadId = `support-${userId}-${ticketId}`;

    const result = await this.pipeline.run(description, threadId);

    // Consolidation de la session dans la mémoire sémantique du domaine Support
    await this.consolidationService.consolidate({
      messages: (result as any).messages ?? [],
      threadId,
      userId,
      scope: { domain: 'support', enterpriseId: 'ent-1' },
      semanticMemoryId: 'support-memory',
    });

    return String(result.output);
  }
}

@Module({
  imports: [
    AiKitModule.forFeature({
      agents: [SupportOrchestratorAgent, TicketQualifierAgent],
      graphs: [supportPipeline],
    }),
  ],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}

// ─── 6. Module racine ─────────────────────────────────────────────────────────

/**
 * AppModule — point d'entrée de l'application.
 *
 * AiKitModule.forRoot() enregistre le modèle global.
 * Chaque domaine apporte ses propres ressources via forFeature().
 */
@Module({
  imports: [
    AiKitModule.forRoot({
      models: [
        {
          id: 'gpt4o',
          provider: 'openai',
          modelName: 'gpt-4o',
          apiKey: process.env.OPENAI_API_KEY,
        },
      ],
    }),
    BillingModule,
    SupportModule,
  ],
})
export class AppModule {}
