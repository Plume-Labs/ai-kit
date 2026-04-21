import { DynamicModule, FactoryProvider, Module, ModuleMetadata, ValueProvider } from '@nestjs/common';
import { AiKitModuleOptions, AiKitFeatureOptions } from './ai-kit.config';
import { AI_KIT_OPTIONS, AI_KIT_FEATURE_OPTIONS } from './ai-kit.tokens';
import { ModelService } from '../models/model.service';
import { McpService } from '../services/mcp.service';
import { HitlService } from '../services/hitl.service';
import { SubAgentService } from '../agents/sub-agent.service';
import { AgentService } from '../agents/agent.service';
import { AgentGraphService } from '../agents/agent-graph.service';
import { AcpService } from '../services/acp.service';
import { AiKitConfiguratorService } from '../services/ai-kit-configurator.service';
import { AiKitFeatureInitializer } from '../services/ai-kit-feature-initializer.service';
import { getAgentToken, getAgentGraphToken } from '../agents/agent.tokens';
import { getToolToken } from '../interfaces/tool.tokens';
import { getMemoryToken } from '../interfaces/memory.tokens';
import { MemoryService } from '../services/memory.service';

const ALL_SERVICES = [
  ModelService,
  McpService,
  MemoryService,
  HitlService,
  SubAgentService,
  AgentService,
  AgentGraphService,
  AcpService,
  AiKitConfiguratorService,
];

/**
 * Options pour forRootAsync.
 */
export interface AiKitModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: any[]) => Promise<AiKitModuleOptions> | AiKitModuleOptions;
  inject?: any[];
}

/**
 * Module NestJS principal d'AiKit.
 *
 * Usage statique :
 * ```ts
 * AiKitModule.forRoot({
 *   models: [{ id: 'gpt4o', provider: 'openai', modelName: 'gpt-4o' }],
 *   mcpServers: [{ id: 'fs', transport: 'stdio', command: 'npx', args: ['@modelcontextprotocol/server-filesystem', '/tmp'] }],
 * })
 * ```
 *
 * Usage asynchrone (avec ConfigService) :
 * ```ts
 * AiKitModule.forRootAsync({
 *   imports: [ConfigModule],
 *   useFactory: (config: ConfigService) => ({
 *     models: [{ id: 'default', provider: 'openai', modelName: config.get('OPENAI_MODEL') }],
 *   }),
 *   inject: [ConfigService],
 * })
 * ```
 */
@Module({})
export class AiKitModule {
  /**
   * Configuration statique du module.
   */
  static forRoot(options: AiKitModuleOptions): DynamicModule {
    const optionsProvider: FactoryProvider = {
      provide: AI_KIT_OPTIONS,
      useFactory: () => options,
    };

    const memoryProviders: FactoryProvider[] = (options.memories ?? []).map((config) => ({
      provide: getMemoryToken(config.id),
      useFactory: (memoryService: MemoryService) => {
        memoryService.registerMemory(config);
        return config.adapter;
      },
      inject: [MemoryService],
    }));

    return {
      module: AiKitModule,
      global: true,
      providers: [optionsProvider, ...ALL_SERVICES, ...memoryProviders],
      exports: [...ALL_SERVICES, ...memoryProviders.map((p) => p.provide)],
    };
  }

  /**
   * Configuration asynchrone du module (compatible avec ConfigService, etc.).
   */
  static forRootAsync(asyncOptions: AiKitModuleAsyncOptions): DynamicModule {
    const optionsProvider: FactoryProvider = {
      provide: AI_KIT_OPTIONS,
      useFactory: asyncOptions.useFactory,
      inject: asyncOptions.inject ?? [],
    };

    return {
      module: AiKitModule,
      global: true,
      imports: asyncOptions.imports ?? [],
      providers: [optionsProvider, ...ALL_SERVICES],
      exports: ALL_SERVICES,
    };
  }

  /**
   * Enregistre des agents, outils MCP, memoires, modèles ou graphes depuis un feature module,
   * sans passer par forRoot().
   *
   * Le module retourné doit être importé dans le feature module concerné.
   * Les ressources sont enregistrées de façon additive dans les services globaux
   * au moment de l'initialisation du feature module.
   *
   * @example
   * ```ts
   * // chat.module.ts
   * @Module({
   *   imports: [
   *     AiKitModule.forFeature({
   *       agents: [
   *         { id: 'chat-agent', modelId: 'gpt4o', systemPrompt: 'Tu es un assistant chat.' },
   *       ],
   *       mcpServers: [
   *         { id: 'chat-fs', transport: 'stdio', command: 'npx', args: ['@mcp/server-filesystem', '/tmp/chat'] },
   *       ],
   *       tools: [
   *         { id: 'search', tool: searchTool },
   *       ],
   *     }),
   *   ],
   * })
   * export class ChatModule {}
   * ```
   */
  static forFeature(options: AiKitFeatureOptions): DynamicModule {
    const featureOptionsProvider: ValueProvider = {
      provide: AI_KIT_FEATURE_OPTIONS,
      useValue: options,
    };

    // Un provider par agent déclaré : résout et enregistre l'Agent dans AgentService,
    // puis le rend injectable via @InjectAgent('id').
    const agentProviders: FactoryProvider[] = (options.agents ?? []).map((config) => ({
      provide: getAgentToken(config.id),
      useFactory: (agentService: AgentService) => agentService.registerAgent(config),
      inject: [AgentService],
    }));

    // Un provider par graphe déclaré : compile l'AgentGraph dans AgentGraphService,
    // puis le rend injectable via @InjectAgentGraph('id').
    const graphProviders: FactoryProvider[] = (options.graphs ?? []).map((def) => ({
      provide: getAgentGraphToken(def.id),
      useFactory: (graphService: AgentGraphService) => graphService.buildGraph(def),
      inject: [AgentGraphService],
    }));

    // Un provider par outil déclaré : enregistre l'outil dans McpService,
    // puis le rend injectable via @InjectTool('id').
    const toolProviders: FactoryProvider[] = (options.tools ?? []).map((config) => ({
      provide: getToolToken(config.id),
      useFactory: (mcpService: McpService) => {
        mcpService.registerTool(config.id, config.tool);
        return config.tool;
      },
      inject: [McpService],
    }));

    // Un provider par memoire declaree : enregistre l'adaptateur dans MemoryService,
    // puis le rend injectable via @InjectMemory('id').
    const memoryProviders: FactoryProvider[] = (options.memories ?? []).map((config) => ({
      provide: getMemoryToken(config.id),
      useFactory: (memoryService: MemoryService) => {
        memoryService.registerMemory(config);
        return config.adapter;
      },
      inject: [MemoryService],
    }));

    const allProviders = [
      featureOptionsProvider,
      AiKitFeatureInitializer,
      ...agentProviders,
      ...graphProviders,
      ...toolProviders,
      ...memoryProviders,
    ];

    // Les tokens nommés sont exportés pour être injectables dans le feature module
    const exportedTokens = [
      ...agentProviders.map((p) => p.provide),
      ...graphProviders.map((p) => p.provide),
      ...toolProviders.map((p) => p.provide),
      ...memoryProviders.map((p) => p.provide),
    ];

    return {
      module: AiKitModule,
      providers: allProviders,
      exports: exportedTokens,
    };
  }
}
