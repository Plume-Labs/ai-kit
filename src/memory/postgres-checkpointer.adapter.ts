import { CheckpointerMemoryAdapter } from '../interfaces/memory.interface';

/**
 * Adaptateur de checkpointer LangGraph persistant via PostgreSQL.
 *
 * Enveloppe un `PostgresSaver` de `@langchain/langgraph-checkpoint-postgres`
 * (dépendance optionnelle — doit etre installee dans le projet consommateur).
 *
 * Usage :
 * ```ts
 * const adapter = await PostgresCheckpointerAdapter.fromConnectionString(
 *   'postgresql://user:pass@localhost:5432/mydb',
 * );
 * AiKitModule.forRoot({
 *   memories: [{ id: 'pg', adapter, type: 'checkpointer', isDefault: true }],
 * });
 * ```
 */
export class PostgresCheckpointerAdapter extends CheckpointerMemoryAdapter {
  /**
   * Crée un adaptateur a partir d'une connection string Postgres.
   * Appelle `saver.setup()` pour creer les tables LangGraph si nécessaire.
   *
   * Requiert `@langchain/langgraph-checkpoint-postgres` dans le projet consommateur.
   */
  static async fromConnectionString(
    connectionString: string,
  ): Promise<PostgresCheckpointerAdapter> {
    let PostgresSaver: any;
    try {
      // Chargement dynamique : évite une dépendance obligatoire dans ai-kit
      ({ PostgresSaver } = require('@langchain/langgraph-checkpoint-postgres'));
    } catch {
      throw new Error(
        '[AiKit] PostgresCheckpointerAdapter requiert @langchain/langgraph-checkpoint-postgres. ' +
          'Installez-le avec : npm install @langchain/langgraph-checkpoint-postgres',
      );
    }
    const saver = PostgresSaver.fromConnString(connectionString);
    await saver.setup();
    return new PostgresCheckpointerAdapter(saver);
  }
}
