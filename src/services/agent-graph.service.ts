import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { StateGraph, END, START, MemorySaver, Annotation, messagesStateReducer } from '@langchain/langgraph';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { IAgentGraph, IGraphRunResult } from '../interfaces/agent-graph.interface';
import { AgentService } from './agent.service';
import { AiKitModuleOptions } from '../module/ai-kit.config';
import { AI_KIT_OPTIONS } from '../module/ai-kit.tokens';

// Schéma d'état partagé entre les nœuds du graphe
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
type CompiledGraph = ReturnType<StateGraph<typeof GraphStateAnnotation.spec>['compile']>;

/**
 * Service de gestion des graphes d'agents hybrides (LangGraph + DeepAgents).
 * Abstraction complète sur StateGraph — les utilisateurs décrivent les graphes
 * via IAgentGraph et n'interagissent jamais avec LangGraph directement.
 */
@Injectable()
export class AgentGraphService implements OnModuleInit {
  private readonly logger = new Logger(AgentGraphService.name);
  private readonly compiledGraphs = new Map<string, CompiledGraph>();
  private checkpointer: MemorySaver;

  constructor(
    @Inject(AI_KIT_OPTIONS)
    private readonly options: AiKitModuleOptions,
    private readonly agentService: AgentService,
  ) {
    this.checkpointer = (options.checkpointer as MemorySaver) ?? new MemorySaver();
  }

  async onModuleInit(): Promise<void> {
    await this.buildGraphs(this.options.graphs ?? []);
  }

  /**
   * Compile plusieurs graphes en lot.
   */
  async buildGraphs(defs: IAgentGraph[]): Promise<void> {
    for (const graphDef of defs) {
      await this.buildGraph(graphDef);
    }
  }

  /**
   * Compile un IAgentGraph en graphe LangGraph prêt à l'exécution.
   */
  async buildGraph(def: IAgentGraph): Promise<void> {
    const graph = new StateGraph(GraphStateAnnotation);

    // Ajouter les nœuds
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

    // Nœud d'entrée
    graph.addEdge(START, def.entryNodeId as any);

    // Arêtes
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

    // Nœud de sortie
    if (def.exitNodeId) {
      graph.addEdge(def.exitNodeId as any, END);
    }

    const compiled = graph.compile({ checkpointer: this.checkpointer });
    this.compiledGraphs.set(def.id, compiled);
    this.logger.log(`[AiKit] Graphe compilé : ${def.id} (${def.nodes.length} nœuds, ${def.edges.length} arêtes)`);
  }

  /**
   * Exécute un graphe compilé.
   */
  async runGraph(
    graphId: string,
    input: string | Record<string, unknown>,
    threadId?: string,
  ): Promise<IGraphRunResult> {
    const compiled = this.compiledGraphs.get(graphId);
    if (!compiled) {
      throw new Error(`[AiKit] Graphe introuvable : ${graphId}`);
    }

    const tid = threadId ?? `graph-thread-${Date.now()}`;
    const inputState: Partial<GraphState> =
      typeof input === 'string' ? { input } : { input };

    const result = await compiled.invoke(inputState as GraphState, {
      configurable: { thread_id: tid },
    });

    return {
      output: result.output ?? result,
      meta: { threadId: tid, graphId },
    };
  }

  /**
   * Exécute un graphe en mode streaming.
   */
  async *streamGraph(
    graphId: string,
    input: string | Record<string, unknown>,
    threadId?: string,
  ): AsyncIterable<unknown> {
    const compiled = this.compiledGraphs.get(graphId);
    if (!compiled) {
      throw new Error(`[AiKit] Graphe introuvable : ${graphId}`);
    }

    const tid = threadId ?? `graph-thread-${Date.now()}`;
    const inputState: Partial<GraphState> =
      typeof input === 'string' ? { input } : { input };

    const stream = compiled.stream(inputState as GraphState, {
      configurable: { thread_id: tid },
      streamMode: 'updates',
    } as any);

    for await (const chunk of await stream) {
      yield chunk;
    }
  }

  /**
   * Liste les graphes enregistrés.
   */
  listGraphs(): string[] {
    return Array.from(this.compiledGraphs.keys());
  }
}
