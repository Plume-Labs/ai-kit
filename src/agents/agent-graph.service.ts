import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IAgentGraph, IGraphRunResult } from './agent-graph.interface';
import { AgentGraph } from './agent-graph';
import { AgentGraphFactory } from './agent-graph.factory';
import { AgentService } from './agent.service';
import { MemoryService } from '../services/memory.service';
import { AiKitModuleOptions } from '../module/ai-kit.config';
import { AI_KIT_OPTIONS } from '../module/ai-kit.tokens';

/**
 * Service de gestion des graphes d'agents.
 *
 * Maintient un registre d'objets `AgentGraph` et délègue entièrement
 * l'exécution à chaque instance via `agentGraph.run()` / `agentGraph.stream()`.
 * La compilation des graphes est assurée par `AgentGraphFactory`.
 */
@Injectable()
export class AgentGraphService implements OnModuleInit {
  private readonly logger = new Logger(AgentGraphService.name);
  private readonly registry = new Map<string, AgentGraph>();
  private readonly factory: AgentGraphFactory;

  constructor(
    @Inject(AI_KIT_OPTIONS)
    private readonly options: AiKitModuleOptions,
    private readonly agentService: AgentService,
    private readonly memoryService: MemoryService,
  ) {
    this.factory = new AgentGraphFactory(agentService, memoryService);
  }

  async onModuleInit(): Promise<void> {
    await this.buildGraphs(this.options.graphs ?? []);
  }

  // ─── Construction ─────────────────────────────────────────────────────────

  /**
   * Compile plusieurs graphes en lot.
   */
  async buildGraphs(defs: IAgentGraph[]): Promise<AgentGraph[]> {
    return Promise.all(defs.map((def) => this.buildGraph(def)));
  }

  /**
   * Compile un graphe à partir de sa définition.
   * Retourne l'objet `AgentGraph` prêt à l'exécution.
   */
  async buildGraph(def: IAgentGraph): Promise<AgentGraph> {
    const graph = await this.factory.create(def);
    this.registry.set(graph.id, graph);
    this.logger.log(
      `[AiKit] Graphe compilé : ${def.id} (${def.nodes.length} nœuds, ${def.edges.length} arêtes)`,
    );
    return graph;
  }

  // ─── Résolution ───────────────────────────────────────────────────────────

  /**
   * Résout un graphe par son id.
   * Lève une erreur si le graphe est introuvable.
   */
  resolve(id: string): AgentGraph {
    const graph = this.registry.get(id);
    if (!graph) throw new Error(`[AiKit] Graphe introuvable : ${id}`);
    return graph;
  }

  // ─── Exécution (délégation à l'objet AgentGraph) ─────────────────────────

  /**
   * Exécute un graphe de façon synchrone jusqu'au nœud de sortie.
   */
  run(
    id: string,
    input: string | Record<string, unknown>,
    threadId?: string,
  ): Promise<IGraphRunResult> {
    return this.resolve(id).run(input, threadId);
  }

  /**
   * Exécute un graphe en mode streaming — émet un chunk par nœud terminé.
   */
  stream(
    id: string,
    input: string | Record<string, unknown>,
    threadId?: string,
  ): AsyncIterable<unknown> {
    return this.resolve(id).stream(input, threadId);
  }

  // ─── Listing ──────────────────────────────────────────────────────────────

  /**
   * Retourne tous les graphes enregistrés.
   */
  listGraphs(): AgentGraph[] {
    return Array.from(this.registry.values());
  }
}
