import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { AiKitFeatureOptions } from '../module/ai-kit.config';
import { AI_KIT_FEATURE_OPTIONS } from '../module/ai-kit.tokens';
import { ModelService } from '../models/model.service';
import { McpService } from './mcp.service';
import { MemoryService } from './memory.service';
import { AgentService } from '../agents/agent.service';
import { AgentGraphService } from '../agents/agent-graph.service';
import { SecurityToolService } from '../security/security-tool.service';

/**
 * Service interne instancié par AiKitModule.forFeature().
 *
 * À l'initialisation du feature module, il enregistre de façon additive
 * les agents, outils MCP, modèles et graphes fournis dans les services globaux.
 *
 * @internal
 */
@Injectable()
export class AiKitFeatureInitializer implements OnModuleInit {
  private readonly logger = new Logger(AiKitFeatureInitializer.name);

  constructor(
    @Inject(AI_KIT_FEATURE_OPTIONS)
    @Optional()
    private readonly featureOptions: AiKitFeatureOptions | null,

    private readonly modelService: ModelService,
    private readonly mcpService: McpService,
    private readonly securityToolService: SecurityToolService,
    private readonly memoryService: MemoryService,
    private readonly agentService: AgentService,
    private readonly agentGraphService: AgentGraphService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.featureOptions) return;

    const { models, mcpServers, tools, securityTools, memories, agents, graphs } = this.featureOptions;

    if (models?.length) {
      this.modelService.registerModels(models);
      this.logger.log(`[AiKit/Feature] ${models.length} modèle(s) enregistré(s)`);
    }

    if (mcpServers?.length) {
      await this.mcpService.configureServers(mcpServers);
      this.logger.log(`[AiKit/Feature] ${mcpServers.length} serveur(s) MCP ajouté(s)`);
    }

    if (tools?.length) {
      this.mcpService.registerTools(tools);
      this.logger.log(`[AiKit/Feature] ${tools.length} outil(s) enregistré(s)`);
    }

    if (securityTools?.length) {
      this.securityToolService.registerTools(securityTools);
      this.logger.log(`[AiKit/Feature] ${securityTools.length} outil(s) de sécurité enregistré(s)`);
    }

    if (memories?.length) {
      this.memoryService.registerMemories(memories);
      this.logger.log(`[AiKit/Feature] ${memories.length} memoire(s) enregistrée(s)`);
    }

    if (agents?.length) {
      await this.agentService.registerAgents(agents);
      this.logger.log(`[AiKit/Feature] ${agents.length} agent(s) enregistré(s)`);
    }

    if (graphs?.length) {
      await this.agentGraphService.buildGraphs(graphs);
      this.logger.log(`[AiKit/Feature] ${graphs.length} graphe(s) enregistré(s)`);
    }
  }
}
