import { Inject } from '@nestjs/common';

/**
 * Retourne le token d'injection NestJS pour un agent donné.
 * Utilisé en interne par `@InjectAgent()` et `forFeature()`.
 *
 * @example
 * ```ts
 * { provide: getAgentToken('chat-agent'), useFactory: ... }
 * ```
 */
export const getAgentToken = (id: string): string => `AI_KIT_AGENT:${id}`;

/**
 * Retourne le token d'injection NestJS pour un graphe d'agents donné.
 * Utilisé en interne par `@InjectAgentGraph()` et `forFeature()`.
 *
 * @example
 * ```ts
 * { provide: getAgentGraphToken('pipeline'), useFactory: ... }
 * ```
 */
export const getAgentGraphToken = (id: string): string => `AI_KIT_AGENT_GRAPH:${id}`;

/**
 * Injecte un objet `Agent` enregistré par `AiKitModule.forFeature()`.
 *
 * @example
 * ```ts
 * @Injectable()
 * export class ChatService {
 *   constructor(
 *     @InjectAgent('chat-agent') private readonly agent: Agent,
 *   ) {}
 *
 *   ask(message: string) {
 *     return this.agent.run({ input: message });
 *   }
 * }
 * ```
 */
export const InjectAgent = (id: string): ParameterDecorator => Inject(getAgentToken(id));

/**
 * Injecte un objet `AgentGraph` enregistré par `AiKitModule.forFeature()`.
 *
 * @example
 * ```ts
 * @Injectable()
 * export class PipelineService {
 *   constructor(
 *     @InjectAgentGraph('analysis-pipeline') private readonly graph: AgentGraph,
 *   ) {}
 *
 *   run(input: string) {
 *     return this.graph.run(input);
 *   }
 * }
 * ```
 */
export const InjectAgentGraph = (id: string): ParameterDecorator =>
  Inject(getAgentGraphToken(id));
