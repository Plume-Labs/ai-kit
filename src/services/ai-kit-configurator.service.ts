import { Injectable } from '@nestjs/common';
import {
  AiKitRuntimeConfigureOptions,
} from '../module/ai-kit.config';
import { ModelService } from '../models/model.service';
import { McpService } from './mcp.service';
import { MemoryService } from './memory.service';
import { AgentService } from '../agents/agent.service';
import { AgentGraphService } from '../agents/agent-graph.service';
import { AcpService } from './acp.service';
import { SecurityToolService } from '../security/security-tool.service';

/**
 * Façade de configuration runtime pour éviter de dépendre uniquement de forRoot().
 */
@Injectable()
export class AiKitConfiguratorService {
  constructor(
    private readonly modelService: ModelService,
    private readonly mcpService: McpService,
    private readonly securityToolService: SecurityToolService,
    private readonly memoryService: MemoryService,
    private readonly agentService: AgentService,
    private readonly agentGraphService: AgentGraphService,
    private readonly acpService: AcpService,
  ) {}

  /**
   * Applique une configuration additive à chaud.
   */
  async configure(options: AiKitRuntimeConfigureOptions): Promise<void> {
    if (options.models?.length) {
      this.modelService.registerModels(options.models);
    }

    if (options.mcpServers?.length) {
      await this.mcpService.configureServers(options.mcpServers, {
        replace: options.replaceMcpServers,
      });
    }

    if (options.securityTools?.length) {
      this.securityToolService.registerTools(options.securityTools);
    }

    if (options.memories?.length) {
      this.memoryService.registerMemories(options.memories);
    }

    if (options.defaultMemoryId) {
      this.memoryService.setDefaultMemory(options.defaultMemoryId);
    }

    if (options.agents?.length) {
      await this.agentService.registerAgents(options.agents, {
        overwrite: options.overwriteAgents,
      });
    }

    if (options.graphs?.length) {
      await this.agentGraphService.buildGraphs(options.graphs);
    }

    if (options.acp !== undefined) {
      await this.acpService.configureServer(options.acp, {
        forceRestart: options.restartAcp,
      });
    }
  }
}
