import { EmbeddingsInterface } from '@langchain/core/embeddings';
import {
  ConsolidatedMemoryEntry,
  ISemanticMemoryAdapter,
  ISemanticSearchOptions,
} from '../interfaces/memory.interface';

/**
 * Interface minimale requise pour un DataSource TypeORM.
 * Évite une dépendance directe sur le package `typeorm` dans ai-kit.
 * Tout objet TypeORM `DataSource` satisfait naturellement ce contrat.
 */
export interface IDataSource {
  /** Exécute une requête SQL brute. */
  query(sql: string, parameters?: unknown[]): Promise<any[]>;
  /** Indique si la connexion est établie. */
  isInitialized: boolean;
  /** Initialise la connexion si ce n'est pas encore fait. */
  initialize(): Promise<unknown>;
}

/**
 * Options de configuration du PgVectorMemoryAdapter.
 */
export interface IPgVectorMemoryOptions {
  /** Nom de la table de stockage (défaut : 'ai_kit_memories') */
  tableName?: string;
  /** Dimension des vecteurs d'embedding (défaut : 1536 pour text-embedding-3-small) */
  dimensions?: number;
}

/**
 * Adaptateur de mémoire long terme base sur pgvector + TypeORM.
 *
 * Stocke des entrées de mémoire consolidées (texte + embedding) dans une table
 * PostgreSQL avec l'extension pgvector, et permet la recherche par similarité
 * cosinus.
 *
 * Requiert :
 * - L'extension pgvector activée sur votre base PostgreSQL.
 * - Un `DataSource` TypeORM connecté a cette base.
 * - Une implementation de `EmbeddingsInterface` pour vectoriser les requêtes.
 *
 * Usage :
 * ```ts
 * const adapter = new PgVectorMemoryAdapter(dataSource, openAIEmbeddings);
 * await adapter.initialize();
 *
 * AiKitModule.forRoot({
 *   memories: [{ id: 'pgvec', adapter, type: 'semantic' }],
 * });
 * ```
 */
export class PgVectorMemoryAdapter implements ISemanticMemoryAdapter {
  private readonly tableName: string;
  private readonly dimensions: number;

  constructor(
    private readonly dataSource: IDataSource,
    private readonly embeddings: EmbeddingsInterface,
    options: IPgVectorMemoryOptions = {},
  ) {
    this.tableName = options.tableName ?? 'ai_kit_memories';
    this.dimensions = options.dimensions ?? 1536;
  }

  /**
   * Crée l'extension pgvector et la table de mémoire si elles n'existent pas.
   * A appeler une fois au démarrage (ex: dans onModuleInit du module consommateur).
   */
  async initialize(): Promise<void> {
    if (!this.dataSource.isInitialized) {
      await this.dataSource.initialize();
    }
    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS vector');
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        thread_id   TEXT,
        user_id     TEXT,
        content     TEXT NOT NULL,
        embedding   vector(${this.dimensions}),
        metadata    JSONB DEFAULT '{}',
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS ${this.tableName}_embedding_idx
      ON ${this.tableName} USING ivfflat (embedding vector_cosine_ops)
    `);
  }

  /**
   * Retourne null : cet adaptateur ne gère pas de checkpointer LangGraph.
   */
  getCheckpointer(): null {
    return null;
  }

  /**
   * Stocke une entrée de mémoire.
   * Génère l'embedding via le modèle configuré si absent.
   */
  async store(entry: ConsolidatedMemoryEntry): Promise<ConsolidatedMemoryEntry> {
    let embedding = entry.embedding;
    if (!embedding) {
      embedding = await this.embeddings.embedQuery(entry.content);
    }

    const rows = await this.dataSource.query(
      `INSERT INTO ${this.tableName} (thread_id, user_id, content, embedding, metadata)
       VALUES ($1, $2, $3, $4::vector, $5)
       RETURNING id, thread_id, user_id, content, metadata, created_at`,
      [
        entry.threadId ?? null,
        entry.userId ?? null,
        entry.content,
        JSON.stringify(embedding),
        JSON.stringify(entry.metadata ?? {}),
      ],
    );

    return this.rowToEntry(rows[0]);
  }

  /**
   * Recherche les entrées les plus proches par similarité cosinus.
   * @param query Texte (vectorise automatiquement) ou vecteur pré-calculé.
   */
  async search(
    query: string | number[],
    options: ISemanticSearchOptions = {},
  ): Promise<ConsolidatedMemoryEntry[]> {
    const k = options.k ?? 5;
    const embedding =
      typeof query === 'string' ? await this.embeddings.embedQuery(query) : query;

    const conditions: string[] = [];
    const params: unknown[] = [JSON.stringify(embedding), k];
    let paramIdx = 3;

    if (options.threadId) {
      conditions.push(`thread_id = $${paramIdx++}`);
      params.push(options.threadId);
    }
    if (options.userId) {
      conditions.push(`user_id = $${paramIdx++}`);
      params.push(options.userId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.dataSource.query(
      `SELECT id, thread_id, user_id, content, metadata, created_at
       FROM ${this.tableName}
       ${where}
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      params,
    );

    return rows.map((row: any) => this.rowToEntry(row));
  }

  private rowToEntry(row: any): ConsolidatedMemoryEntry {
    return {
      id: row.id,
      threadId: row.thread_id ?? undefined,
      userId: row.user_id ?? undefined,
      content: row.content,
      metadata: row.metadata ?? undefined,
      createdAt: row.created_at ? new Date(row.created_at) : undefined,
    };
  }
}
