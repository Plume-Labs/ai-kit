import { DynamicModule, FactoryProvider, Module, ModuleMetadata } from '@nestjs/common';
import { AiKitModuleOptions } from './ai-kit.config';
import { AI_KIT_OPTIONS } from './ai-kit.tokens';
import { ModelService } from '../services/model.service';
import { McpService } from '../services/mcp.service';
import { HitlService } from '../services/hitl.service';
import { SubAgentService } from '../services/sub-agent.service';
import { AgentService } from '../services/agent.service';
import { AgentGraphService } from '../services/agent-graph.service';
import { AcpService } from '../services/acp.service';
import { AiKitConfiguratorService } from '../services/ai-kit-configurator.service';

const ALL_SERVICES = [
  ModelService,
  McpService,
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

    return {
      module: AiKitModule,
      global: true,
      providers: [optionsProvider, ...ALL_SERVICES],
      exports: ALL_SERVICES,
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
}
