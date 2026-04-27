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
import { resolveAgentDefinitionInput } from '../agents/agent.definition';
import { getToolToken } from '../interfaces/tool.tokens';
import { getSecurityToolToken } from '../interfaces/security-tool.tokens';
import { getMemoryToken } from '../interfaces/memory.tokens';
import { MemoryService } from '../services/memory.service';
import { SecurityToolService } from '../security/security-tool.service';
import { MemoryConsolidationService } from '../services/memory-consolidation.service';
import { SemanticMemoryFactory } from '../memory/semantic-memory.factory';
import { ToolSelectorService } from '../services/tool-selector.service';

const ALL_SERVICES = [
  ModelService,
  McpService,
  SecurityToolService,
  MemoryService,
  HitlService,
  SubAgentService,
  ToolSelectorService,
  AgentService,
  AgentGraphService,
  AcpService,
  AiKitConfiguratorService,
  MemoryConsolidationService,
  SemanticMemoryFactory,
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

    // Un provider par agent déclaré : force l'initialisation additive forFeature(),
    // puis résout l'Agent déjà enregistré dans AgentService.
    const agentProviders: FactoryProvider[] = (options.agents ?? []).map((input) => {
      const config = resolveAgentDefinitionInput(input);
      return {
        provide: getAgentToken(config.id),
        useFactory: async (
          initializer: AiKitFeatureInitializer,
          agentService: AgentService,
        ) => {
          await initializer.initialize();
          return agentService.resolve(config.id);
        },
        inject: [AiKitFeatureInitializer, AgentService],
      };
    });

    // Un provider par graphe déclaré : force l'initialisation additive forFeature(),
    // puis résout le graphe déjà compilé dans AgentGraphService.
    const graphProviders: FactoryProvider[] = (options.graphs ?? []).map((def) => ({
      provide: getAgentGraphToken(def.id),
      useFactory: async (
        initializer: AiKitFeatureInitializer,
        graphService: AgentGraphService,
      ) => {
        await initializer.initialize();
        return graphService.resolve(def.id);
      },
      inject: [AiKitFeatureInitializer, AgentGraphService],
    }));

    // Un provider par outil déclaré : force l'initialisation additive forFeature(),
    // puis résout l'outil enregistré dans McpService.
    const toolProviders: FactoryProvider[] = (options.tools ?? []).map((config) => ({
      provide: getToolToken(config.id),
      useFactory: async (
        initializer: AiKitFeatureInitializer,
        mcpService: McpService,
      ) => {
        await initializer.initialize();
        return mcpService.getTool(config.id);
      },
      inject: [AiKitFeatureInitializer, McpService],
    }));

    // Un provider par outil de sécurité : force l'initialisation additive forFeature(),
    // puis résout l'outil compilé via SecurityToolService.
    const securityToolProviders: FactoryProvider[] = (options.securityTools ?? []).map((config) => ({
      provide: getSecurityToolToken(config.id),
      useFactory: async (
        initializer: AiKitFeatureInitializer,
        securityToolService: SecurityToolService,
      ) => {
        await initializer.initialize();
        return securityToolService.getTool(config.id);
      },
      inject: [AiKitFeatureInitializer, SecurityToolService],
    }));

    // Un provider par memoire declaree : force l'initialisation additive forFeature(),
    // puis résout l'adaptateur depuis MemoryService.
    const memoryProviders: FactoryProvider[] = (options.memories ?? []).map((config) => ({
      provide: getMemoryToken(config.id),
      useFactory: async (
        initializer: AiKitFeatureInitializer,
        memoryService: MemoryService,
      ) => {
        await initializer.initialize();
        return memoryService.resolve(config.id);
      },
      inject: [AiKitFeatureInitializer, MemoryService],
    }));

    const allProviders = [
      featureOptionsProvider,
      AiKitFeatureInitializer,
      ...agentProviders,
      ...graphProviders,
      ...toolProviders,
      ...securityToolProviders,
      ...memoryProviders,
    ];

    // Les tokens nommés sont exportés pour être injectables dans le feature module
    const exportedTokens = [
      ...agentProviders.map((p) => p.provide),
      ...graphProviders.map((p) => p.provide),
      ...toolProviders.map((p) => p.provide),
      ...securityToolProviders.map((p) => p.provide),
      ...memoryProviders.map((p) => p.provide),
    ];

    return {
      module: AiKitModule,
      providers: allProviders,
      exports: exportedTokens,
    };
  }
}
