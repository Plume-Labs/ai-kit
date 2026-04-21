import { IAgentGraph, IGraphRunResult } from './agent-graph.interface';

// Type opaque pour le graphe compilé LangGraph
type CompiledGraph = ReturnType<any>;

/**
 * Représente un graphe d'agents compilé et prêt à l'exécution.
 *
 * Construit via `AgentGraphFactory.create()` — ne pas instancier directement.
 * Encapsule le StateGraph LangGraph compilé et expose `run()` et `stream()`.
 */
export class AgentGraph {
  readonly id: string;

  /** Définition source du graphe */
  readonly definition: IAgentGraph;

  /** @internal Graphe LangGraph compilé */
  private readonly compiled: CompiledGraph;

  private readonly checkpointer: unknown;

  /** @internal Appelé uniquement par AgentGraphFactory */
  constructor(
    id: string,
    definition: IAgentGraph,
    compiled: CompiledGraph,
    checkpointer: unknown,
  ) {
    this.id = id;
    this.definition = definition;
    this.compiled = compiled;
    this.checkpointer = checkpointer;
  }

  /**
   * Exécute le graphe de façon synchrone jusqu'au nœud de sortie.
   *
   * @param input     Entrée initiale passée au nœud d'entrée
   * @param threadId  Identifiant de thread pour le checkpointer (auto-généré si absent)
   */
  async run(
    input: string | Record<string, unknown>,
    threadId?: string,
  ): Promise<IGraphRunResult> {
    const tid = threadId ?? `graph-thread-${Date.now()}`;
    const inputState = { input };

    const result = await this.compiled.invoke(inputState, {
      configurable: { thread_id: tid },
    });

    return {
      output: result.output ?? result,
      meta: { threadId: tid, graphId: this.id },
    };
  }

  /**
   * Exécute le graphe en mode streaming — émet un chunk par nœud terminé.
   *
   * @param input     Entrée initiale passée au nœud d'entrée
   * @param threadId  Identifiant de thread pour le checkpointer (auto-généré si absent)
   */
  async *stream(
    input: string | Record<string, unknown>,
    threadId?: string,
  ): AsyncIterable<unknown> {
    const tid = threadId ?? `graph-thread-${Date.now()}`;
    const inputState = { input };

    const streamResult = this.compiled.stream(inputState, {
      configurable: { thread_id: tid },
      streamMode: 'updates',
    } as any);

    for await (const chunk of await streamResult) {
      yield chunk;
    }
  }
}
