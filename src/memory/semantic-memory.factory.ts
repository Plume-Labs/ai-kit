import { Injectable } from '@nestjs/common';
import { EmbeddingsInterface } from '@langchain/core/embeddings';
import { MemoryService } from '../services/memory.service';
import { IDataSource, PgVectorMemoryAdapter } from './pg-vector.adapter';
import {
  SemanticMemoryDefinitionInput,
  resolveSemanticMemoryDefinitionInput,
} from './semantic-memory.definition';

/**
 * Dépendances d'exécution requises pour instancier un adaptateur sémantique.
 *
 * Ces dépendances sont séparées de la configuration déclarative (decorator)
 * car elles proviennent du contexte d'exécution (TypeORM, provider d'embeddings).
 */
export interface ISemanticMemoryRuntimeDeps {
  /**
   * DataSource TypeORM (duck-typed `IDataSource`) — connexion PostgreSQL.
   * Tout objet TypeORM `DataSource` satisfait cette interface.
   */
  dataSource: IDataSource;
  /**
   * Implémentation d'embeddings (`EmbeddingsInterface` de `@langchain/core`).
   * Exemples : `OpenAIEmbeddings`, `OllamaEmbeddings`, `FakeEmbeddings`.
   */
  embeddings: EmbeddingsInterface;
}

/**
 * Factory injectable pour créer et enregistrer des mémoires sémantiques
 * à partir de classes décorées avec `@SemanticMemoryDefinition`.
 *
 * Pattern recommandé dans une architecture CQRS / DDD multi-domaine :
 * chaque bounded context déclare sa propre mémoire isolée comme une classe
 * décorée, et utilise `SemanticMemoryFactory` pour l'instancier dans
 * `onModuleInit`.
 *
 * @example
 * ```ts
 * // billing/billing-memory.ts
 * \@SemanticMemoryDefinition({
 *   id: 'billing-mem',
 *   defaultScope: { domain: 'billing', enterpriseId: 'ent-1' },
 * })
 * export class BillingMemory {}
 *
 * // billing/billing.module-init.ts
 * \@Injectable()
 * class BillingInit implements OnModuleInit {
 *   constructor(
 *     private readonly semanticMemoryFactory: SemanticMemoryFactory,
 *     private readonly dataSource: DataSource,         // TypeORM
 *     private readonly embeddings: OpenAIEmbeddings,   // @langchain/openai
 *   ) {}
 *
 *   async onModuleInit() {
 *     // L'adaptateur est initialisé (schema SQL, indexes) et enregistré dans MemoryService
 *     await this.semanticMemoryFactory.createAndRegister(BillingMemory, {
 *       dataSource: this.dataSource,
 *       embeddings: this.embeddings,
 *     });
 *   }
 * }
 * ```
 */
@Injectable()
export class SemanticMemoryFactory {
  constructor(private readonly memoryService: MemoryService) {}

  /**
   * Crée un `PgVectorMemoryAdapter` depuis une définition décorée ou une config brute.
   *
   * Appelle `adapter.initialize()` pour créer l'extension pgvector, la table et les
   * indexes si nécessaire. L'adaptateur est **retourné mais pas enregistré** dans
   * `MemoryService` — utilisez `createAndRegister` pour les cas habituels.
   *
   * @param definition Classe décorée avec `@SemanticMemoryDefinition` ou config brute.
   * @param deps       Runtime : `{ dataSource, embeddings }`.
   * @returns          Adaptateur pgvector initialisé.
   */
  async create(
    definition: SemanticMemoryDefinitionInput,
    deps: ISemanticMemoryRuntimeDeps,
  ): Promise<PgVectorMemoryAdapter> {
    const config = resolveSemanticMemoryDefinitionInput(definition);
    const adapter = new PgVectorMemoryAdapter(deps.dataSource, deps.embeddings, {
      tableName: config.tableName,
      dimensions: config.dimensions,
      defaultScope: config.defaultScope,
    });
    await adapter.initialize();
    return adapter;
  }

  /**
   * Crée un `PgVectorMemoryAdapter` et l'enregistre dans `MemoryService`.
   *
   * Équivalent à `create()` suivi de `memoryService.registerMemory()`.
   * C'est l'API principale à utiliser dans `onModuleInit` des bounded contexts.
   *
   * @param definition Classe décorée avec `@SemanticMemoryDefinition` ou config brute.
   * @param deps       Runtime : `{ dataSource, embeddings }`.
   * @returns          Adaptateur pgvector initialisé et enregistré.
   */
  async createAndRegister(
    definition: SemanticMemoryDefinitionInput,
    deps: ISemanticMemoryRuntimeDeps,
  ): Promise<PgVectorMemoryAdapter> {
    const config = resolveSemanticMemoryDefinitionInput(definition);
    const adapter = await this.create(definition, deps);
    this.memoryService.registerMemory({
      id: config.id,
      adapter,
      type: 'semantic',
      isDefault: config.isDefault,
    });
    return adapter;
  }
}
