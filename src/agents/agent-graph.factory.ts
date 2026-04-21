import {
  StateGraph,
  END,
  START,
  Annotation,
  messagesStateReducer,
} from '@langchain/langgraph';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { IAgentGraph } from './agent-graph.interface';
import { AgentGraph } from './agent-graph';
import { AgentService } from './agent.service';
import { MemoryService } from '../services/memory.service';

// ─── Schéma d'état partagé entre les nœuds ───────────────────────────────────

const GraphStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  input: Annotation<string | Record<string, unknown> | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
  output: Annotation<unknown>({
    reducer: (_, y) => y,
    default: () => null,
  }),
  threadId: Annotation<string | undefined>({
    reducer: (_, y) => y,
    default: () => undefined,
  }),
});

type GraphState = typeof GraphStateAnnotation.State;

/**
 * Factory interne : construit un `AgentGraph` à partir d'une `IAgentGraph`.
 *
 * Compile le StateGraph LangGraph (ajout des nœuds, arêtes, checkpointer)
 * et retourne un objet `AgentGraph` autonome avec `run()` et `stream()`.
 *
 * @internal Utilisé par AgentGraphService — ne pas utiliser directement.
 */
export class AgentGraphFactory {
  constructor(
    private readonly agentService: AgentService,
    private readonly memoryService: MemoryService,
  ) {}

  async create(def: IAgentGraph): Promise<AgentGraph> {
    const graph = new StateGraph(GraphStateAnnotation);

    // ── Nœuds ──────────────────────────────────────────────────────────────
    for (const node of def.nodes) {
      graph.addNode(node.id, async (state: GraphState) => {
        const inputValue =
          state.input ??
          (state.messages.at(-1)?.content as string | undefined) ??
          '';

        const result = await this.agentService.run(node.agentId, {
          input: inputValue,
          threadId: state.threadId,
        });

        return {
          messages: [new HumanMessage(String(result.output))],
          output: result.output,
        };
      });
    }

    // ── Nœud d'entrée ──────────────────────────────────────────────────────
    graph.addEdge(START, def.entryNodeId as any);

    // ── Arêtes ─────────────────────────────────────────────────────────────
    for (const edge of def.edges) {
      if (edge.condition) {
        graph.addConditionalEdges(
          edge.from as any,
          (state: GraphState) => {
            const val = (state as Record<string, unknown>)[edge.condition!];
            return val === edge.conditionValue ? edge.to : END;
          },
        );
      } else {
        graph.addEdge(edge.from as any, edge.to as any);
      }
    }

    // ── Nœud de sortie ─────────────────────────────────────────────────────
    if (def.exitNodeId) {
      graph.addEdge(def.exitNodeId as any, END);
    }

    const checkpointer = this.memoryService.getCheckpointer(def.memoryId);
    const compiled = graph.compile({ checkpointer: checkpointer as any });

    return new AgentGraph(def.id, def, compiled, checkpointer);
  }
}
