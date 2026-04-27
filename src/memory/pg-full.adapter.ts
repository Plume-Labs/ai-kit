import { EmbeddingsInterface } from '@langchain/core/embeddings';
import { ICompositeMemoryAdapter, ConsolidatedMemoryEntry, ISemanticSearchOptions } from '../interfaces/memory.interface';
import { IDataSource, IPgVectorMemoryOptions, PgVectorMemoryAdapter } from './pg-vector.adapter';
import { PostgresCheckpointerAdapter } from './postgres-checkpointer.adapter';

/**
 * Options de configuration du PgFullMemoryAdapter.
 */
export interface IPgFullMemoryOptions extends IPgVectorMemoryOptions {
  /**
   * Connection string pour le checkpointer LangGraph (PostgresSaver).
   * Requiert `@langchain/langgraph-checkpoint-postgres` dans le projet consommateur.
   * Si absent, un `PostgresCheckpointerAdapter` doit etre fourni via `checkpointerAdapter`.
   */
  connectionString?: string;

  /**
   * Adaptateur checkpointer pré-construit.
   * Utilise a la place de `connectionString` si fourni.
   */
  checkpointerAdapter?: PostgresCheckpointerAdapter;
}

/**
 * Adaptateur composite : checkpointer LangGraph (court terme) + pgvector (long terme).
 *
 * Combine `PostgresCheckpointerAdapter` et `PgVectorMemoryAdapter` dans un seul
 * objet enregistrable dans `MemoryService` avec `type: 'composite'`.
 *
 * Usage :
 * ```ts
 * const adapter = await PgFullMemoryAdapter.create(dataSource, embeddings, {
 *   connectionString: 'postgresql://user:pass@localhost:5432/mydb',
 * });
 * await adapter.initialize();
 *
 * AiKitModule.forRoot({
 *   memories: [{ id: 'full', adapter, type: 'composite', isDefault: true }],
 * });
 * ```
 */
export class PgFullMemoryAdapter implements ICompositeMemoryAdapter {
  private constructor(
    private readonly checkpointer: PostgresCheckpointerAdapter,
    private readonly vectorAdapter: PgVectorMemoryAdapter,
  ) {}

  /**
   * Fabrique : construit le composite en initialisant le checkpointer Postgres.
   *
   * @param dataSource  DataSource TypeORM connecté a la même base (ou une base différente).
   * @param embeddings  Modèle d'embedding pour les requêtes sémantiques.
   * @param options     Connection string ou adaptateur checkpointer pré-construit + options pgvector.
   */
  static async create(
    dataSource: IDataSource,
    embeddings: EmbeddingsInterface,
    options: IPgFullMemoryOptions = {},
  ): Promise<PgFullMemoryAdapter> {
    let checkpointerAdapter: PostgresCheckpointerAdapter;

    if (options.checkpointerAdapter) {
      checkpointerAdapter = options.checkpointerAdapter;
    } else if (options.connectionString) {
      checkpointerAdapter = await PostgresCheckpointerAdapter.fromConnectionString(
        options.connectionString,
      );
    } else {
      throw new Error(
        '[AiKit] PgFullMemoryAdapter requiert `connectionString` ou `checkpointerAdapter`.',
      );
    }

    const vectorAdapter = new PgVectorMemoryAdapter(dataSource, embeddings, options);
    return new PgFullMemoryAdapter(checkpointerAdapter, vectorAdapter);
  }

  /**
   * Crée la table pgvector et ses index.
   * A appeler une fois au démarrage.
   */
  async initialize(): Promise<void> {
    await this.vectorAdapter.initialize();
  }

  /** @inheritdoc */
  getCheckpointer(): unknown {
    return this.checkpointer.getCheckpointer();
  }

  /** @inheritdoc */
  store(entry: ConsolidatedMemoryEntry): Promise<ConsolidatedMemoryEntry> {
    return this.vectorAdapter.store(entry);
  }

  /** @inheritdoc */
  search(
    query: string | number[],
    options?: ISemanticSearchOptions,
  ): Promise<ConsolidatedMemoryEntry[]> {
    return this.vectorAdapter.search(query, options);
  }
}
