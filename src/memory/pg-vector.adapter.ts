import { EmbeddingsInterface } from '@langchain/core/embeddings';
import {
  ConsolidatedMemoryEntry,
  ISemanticMemoryAdapter,
  ISemanticSearchOptions,
  MemoryScope,
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
  /**
   * Scope par défaut appliqué à TOUTES les opérations `store` et `search`.
   *
   * Ce scope est fusionné avec celui passé à chaque appel ; en cas de conflit,
   * le `defaultScope` **prend la priorité** (sécurité : le code appelant ne peut
   * pas sortir des frontières imposées par l'adaptateur).
   *
   * Recommandation : instancier un adaptateur par domaine/entreprise pour
   * garantir l'isolation mémoire dans une architecture CQRS multi-tenant.
   *
   * ```ts
   * // Adapter isolé au domaine 'billing' de l'entreprise 'ent-1'
   * new PgVectorMemoryAdapter(ds, embeddings, {
   *   defaultScope: { domain: 'billing', enterpriseId: 'ent-1' },
   * });
   * ```
   */
  defaultScope?: MemoryScope;
}

/**
 * Adaptateur de mémoire long terme basé sur pgvector + TypeORM.
 *
 * Stocke des entrées de mémoire consolidées (texte + embedding) dans une table
 * PostgreSQL avec l'extension pgvector, et permet la recherche par similarité
 * cosinus.
 *
 * **Isolation mémoire** : chaque entrée porte un `scope` JSONB indexé par GIN,
 * permettant de partitionner la mémoire par domaine, entreprise, projet, etc.
 * Le `defaultScope` de l'adaptateur est appliqué automatiquement à chaque
 * opération, garantissant l'isolation même si le code appelant omet le scope.
 *
 * Requiert :
 * - L'extension pgvector activée sur votre base PostgreSQL.
 * - Un `DataSource` TypeORM connecté à cette base.
 * - Une implémentation de `EmbeddingsInterface` pour vectoriser les requêtes.
 *
 * Usage :
 * ```ts
 * const adapter = new PgVectorMemoryAdapter(dataSource, openAIEmbeddings, {
 *   defaultScope: { domain: 'billing', enterpriseId: 'ent-1' },
 * });
 * await adapter.initialize();
 *
 * AiKitModule.forRoot({
 *   memories: [{ id: 'billing-mem', adapter, type: 'semantic' }],
 * });
 * ```
 */
export class PgVectorMemoryAdapter implements ISemanticMemoryAdapter {
  private readonly tableName: string;
  private readonly dimensions: number;
  private readonly defaultScope: MemoryScope;

  /**
   * Regex d'identifiant SQL valide : lettres, chiffres, underscore, 1–63 caractères.
   * Empêche toute injection SQL via le nom de table.
   */
  private static readonly VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

  /**
   * Longueur maximale du préfixe utilisé pour générer les noms d'index.
   * Garantit que le nom complet (préfixe + suffixe tel que '_embedding_idx')
   * reste dans la limite Postgres des 63 caractères par identifiant.
   */
  private static readonly MAX_INDEX_PREFIX_LENGTH = 45;

  constructor(
    private readonly dataSource: IDataSource,
    private readonly embeddings: EmbeddingsInterface,
    options: IPgVectorMemoryOptions = {},
  ) {
    const tableName = options.tableName ?? 'ai_kit_memories';
    if (!PgVectorMemoryAdapter.VALID_IDENTIFIER.test(tableName)) {
      throw new Error(
        `[AiKit] Nom de table invalide : "${tableName}". ` +
          'Seuls les identifiants SQL valides sont acceptés (lettres, chiffres, underscores).',
      );
    }
    this.tableName = tableName;
    this.dimensions = options.dimensions ?? 1536;
    this.defaultScope = options.defaultScope ?? {};
  }

  /**
   * Crée l'extension pgvector et la table de mémoire si elles n'existent pas,
   * et applique les migrations de schéma nécessaires (colonne `scope`).
   *
   * À appeler une fois au démarrage (ex: dans `onModuleInit` du module consommateur).
   */
  async initialize(): Promise<void> {
    if (!this.dataSource.isInitialized) {
      await this.dataSource.initialize();
    }
    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS vector');
    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        thread_id   TEXT,
        user_id     TEXT,
        content     TEXT NOT NULL,
        embedding   vector(${this.dimensions}),
        metadata    JSONB NOT NULL DEFAULT '{}',
        scope       JSONB NOT NULL DEFAULT '{}',
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Assure la présence de la colonne scope (compatibilité ascendante avec les tables existantes)
    await this.dataSource.query(`
      ALTER TABLE ${this.tableName}
        ADD COLUMN IF NOT EXISTS scope JSONB NOT NULL DEFAULT '{}'
    `);
    // Tronque le préfixe pour que les noms d'index restent dans la limite Postgres (63 chars)
    const idxPrefix =
      this.tableName.length > PgVectorMemoryAdapter.MAX_INDEX_PREFIX_LENGTH
        ? this.tableName.substring(0, PgVectorMemoryAdapter.MAX_INDEX_PREFIX_LENGTH)
        : this.tableName;
    // Index ivfflat pour la recherche par similarité cosinus
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS ${idxPrefix}_embedding_idx
      ON ${this.tableName} USING ivfflat (embedding vector_cosine_ops)
    `);
    // Index GIN sur scope pour le filtrage par isolation (JSONB @> containment)
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS ${idxPrefix}_scope_idx
      ON ${this.tableName} USING gin (scope)
    `);
    // Index B-tree sur thread_id pour les filtres par thread
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS ${idxPrefix}_thread_id_idx
      ON ${this.tableName} (thread_id)
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
   * Le scope effectif est la fusion de `entry.scope` et du `defaultScope` de l'adaptateur.
   */
  async store(entry: ConsolidatedMemoryEntry): Promise<ConsolidatedMemoryEntry> {
    let embedding = entry.embedding;
    if (!embedding) {
      embedding = await this.embeddings.embedQuery(entry.content);
    }

    const effectiveScope = this.buildEffectiveScope(entry.scope);

    const rows = await this.dataSource.query(
      `INSERT INTO ${this.tableName} (thread_id, user_id, content, embedding, metadata, scope)
       VALUES ($1, $2, $3, $4::vector, $5, $6)
       RETURNING id, thread_id, user_id, content, metadata, scope, created_at`,
      [
        entry.threadId ?? null,
        entry.userId ?? null,
        entry.content,
        JSON.stringify(embedding),
        JSON.stringify(entry.metadata ?? {}),
        JSON.stringify(effectiveScope),
      ],
    );

    return this.rowToEntry(rows[0]);
  }

  /**
   * Recherche les entrées les plus proches par similarité cosinus.
   *
   * Le scope de recherche est la fusion de `options.scope` et du `defaultScope`
   * de l'adaptateur (le defaultScope prend la priorité — isolation garantie).
   *
   * @param query Texte (vectorisé automatiquement) ou vecteur pré-calculé.
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

    const effectiveScope = this.buildEffectiveScope(options.scope);
    if (Object.keys(effectiveScope).length > 0) {
      conditions.push(`scope @> $${paramIdx++}::jsonb`);
      params.push(JSON.stringify(effectiveScope));
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.dataSource.query(
      `SELECT id, thread_id, user_id, content, metadata, scope, created_at
       FROM ${this.tableName}
       ${where}
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      params,
    );

    return rows.map((row: any) => this.rowToEntry(row));
  }

  // ─── Helpers privés ──────────────────────────────────────────────────────────

  /**
   * Fusionne le scope d'appel avec le defaultScope de l'adaptateur.
   * Le defaultScope prend la priorité sur le scope d'appel pour les clés en conflit,
   * garantissant que le code appelant ne peut pas sortir des frontières imposées.
   */
  private buildEffectiveScope(callScope?: MemoryScope): Record<string, string> {
    // Filtre les valeurs undefined de chaque scope avant la fusion
    const cleanCallScope = callScope
      ? Object.fromEntries(
          Object.entries(callScope).filter(([, v]) => v !== undefined),
        ) as Record<string, string>
      : {};
    const cleanDefaultScope = Object.fromEntries(
      Object.entries(this.defaultScope).filter(([, v]) => v !== undefined),
    ) as Record<string, string>;

    // defaultScope en dernier pour prendre la priorité (sécurité)
    return { ...cleanCallScope, ...cleanDefaultScope };
  }

  private rowToEntry(row: any): ConsolidatedMemoryEntry {
    const scope = row.scope as Record<string, string> | undefined;
    return {
      id: row.id,
      threadId: row.thread_id ?? undefined,
      userId: row.user_id ?? undefined,
      content: row.content,
      scope: scope && Object.keys(scope).length > 0 ? scope : undefined,
      metadata: row.metadata ?? undefined,
      createdAt: row.created_at ? new Date(row.created_at) : undefined,
    };
  }
}
