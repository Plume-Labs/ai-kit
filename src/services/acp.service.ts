import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DeepAgentsServer, DeepAgentConfig } from 'deepagents-acp';
import { IAcpServerConfig } from '../interfaces/acp.interface';
import { ModelService } from './model.service';
import { McpService } from './mcp.service';
import { AiKitModuleOptions } from '../module/ai-kit.config';
import { AI_KIT_OPTIONS } from '../module/ai-kit.tokens';

/**
 * Service ACP (Agent Communication Protocol).
 * Démarre / arrête un DeepAgentsServer en suivant le cycle de vie NestJS.
 * Les utilisateurs configurent le serveur via IAcpServerConfig sans toucher à deepagents-acp.
 */
@Injectable()
export class AcpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AcpService.name);
  private server?: DeepAgentsServer;
  private currentConfig?: IAcpServerConfig;

  constructor(
    @Inject(AI_KIT_OPTIONS)
    private readonly options: AiKitModuleOptions,
    private readonly modelService: ModelService,
    private readonly mcpService: McpService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.configureServer(this.options.acp);
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopServer();
  }

  /**
   * Configure le serveur ACP à chaud.
   * - `config` absent/null : arrêt du serveur
   * - `forceRestart=true` : redémarre même avec config identique
   */
  async configureServer(
    config?: IAcpServerConfig | null,
    options?: { forceRestart?: boolean },
  ): Promise<void> {
    if (!config) {
      this.currentConfig = undefined;
      await this.stopServer();
      return;
    }

    const mustRestart = options?.forceRestart ?? true;
    if (mustRestart) {
      await this.stopServer();
    }

    const agentConfigs = this.buildAgentConfigs(config);

    const nextServer = new DeepAgentsServer({
      agents: agentConfigs,
      ...(config.authMethods ? { authMethods: config.authMethods as any[] } : {}),
      ...(config.workspaceRoot ? { workspaceRoot: config.workspaceRoot } : {}),
    });

    try {
      await nextServer.start();
      this.server = nextServer;
      this.currentConfig = config;
      const port = config.port ?? 9000;
      this.logger.log(`[AiKit] Serveur ACP démarré sur le port ${port}`);
    } catch (err) {
      this.logger.error('[AiKit] Erreur lors du démarrage du serveur ACP', err);
      try {
        await nextServer.stop();
      } catch {
        // Ignorer les erreurs de fermeture
      }
    }
  }

  /**
   * Retourne true si le serveur ACP est démarré.
   */
  isRunning(): boolean {
    return !!this.server;
  }

  private buildAgentConfigs(config: IAcpServerConfig): DeepAgentConfig[] {
    const rawAgents = Array.isArray(config.agents)
      ? config.agents
      : [config.agents];

    return rawAgents.map((a) => {
      const model = a.modelId
        ? this.modelService._getInternalModel(a.modelId)
        : undefined;

      const tools = this.mcpService._getInternalTools(a.mcpServerIds);

      return {
        name: a.name,
        description: a.description,
        ...(model ? { model: model as any } : {}),
        ...(tools.length > 0 ? { tools: tools as any[] } : {}),
        commands: a.commands,
      } as DeepAgentConfig;
    });
  }

  private async stopServer(): Promise<void> {
    if (!this.server) return;
    try {
      await this.server.stop();
      this.logger.log('[AiKit] Serveur ACP arrêté');
    } catch (err) {
      this.logger.error('[AiKit] Erreur lors de l\'arrêt du serveur ACP', err);
    } finally {
      this.server = undefined;
    }
  }
}
