import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { StructuredTool } from '@langchain/core/tools';
import { IMcpServerConfig } from '../interfaces/tool.interface';
import { ITool } from '../interfaces/tool.interface';
import { AiKitModuleOptions } from '../module/ai-kit.config';
import { AI_KIT_OPTIONS } from '../module/ai-kit.tokens';

/**
 * Service de gestion des serveurs MCP (Model Context Protocol).
 * Abstrait MultiServerMCPClient — les utilisateurs interagissent uniquement via ITool[].
 */
@Injectable()
export class McpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpService.name);
  private client?: MultiServerMCPClient;
  private tools: StructuredTool[] = [];
  private readonly serverRegistry = new Map<string, IMcpServerConfig>();

  constructor(
    @Inject(AI_KIT_OPTIONS)
    private readonly options: AiKitModuleOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.configureServers(this.options.mcpServers ?? []);
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeClient();
    this.tools = [];
  }

  /**
   * Configure les serveurs MCP.
   * - `replace=true` : remplace la configuration existante
   * - `replace=false` : fusionne par id (comportement par défaut)
   */
  async configureServers(
    servers: IMcpServerConfig[],
    options?: { replace?: boolean },
  ): Promise<void> {
    if (options?.replace) {
      this.serverRegistry.clear();
    }

    for (const server of servers) {
      this.serverRegistry.set(server.id, server);
    }

    await this.reloadTools();
  }

  /**
   * Retourne les outils MCP disponibles sous forme d'ITool[].
   */
  getTools(): ITool[] {
    return this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.schema ? JSON.parse(JSON.stringify(t.schema)) : undefined,
    }));
  }

  /**
   * Retourne les outils filtrés par ID de serveur.
   */
  getToolsByServer(serverId: string): ITool[] {
    // Les outils MCP ne portent pas l'info du serveur d'origine —
    // on retourne tous les outils si le serverId n'est pas matché.
    return this.getTools();
  }

  /**
   * @internal — Retourne les StructuredTool natifs pour injection dans DeepAgent.
   */
  _getInternalTools(serverIds?: string[]): StructuredTool[] {
    return this.tools;
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private buildConnectionConfig(server: IMcpServerConfig): unknown {
    if (server.transport === 'stdio') {
      return {
        transport: 'stdio',
        command: server.command,
        args: server.args,
        env: server.env,
      };
    } else {
      return {
        transport: 'sse',
        url: server.url,
        headers: server.headers,
      };
    }
  }

  private async reloadTools(): Promise<void> {
    const servers = Array.from(this.serverRegistry.values());
    if (servers.length === 0) {
      await this.closeClient();
      this.tools = [];
      return;
    }

    const connections: Record<string, unknown> = {};
    for (const server of servers) {
      connections[server.id] = this.buildConnectionConfig(server);
    }

    const nextClient = new MultiServerMCPClient({ connections } as any);

    try {
      const nextTools = await nextClient.getTools();
      await this.closeClient();
      this.client = nextClient;
      this.tools = nextTools;
      this.logger.log(`[AiKit] MCP : ${this.tools.length} outil(s) chargé(s) depuis ${servers.length} serveur(s)`);
    } catch (err) {
      try {
        await (nextClient as any).close?.();
      } catch {
        // Ignorer les erreurs de fermeture
      }
      this.logger.error('[AiKit] Erreur lors du chargement des outils MCP', err);
    }
  }

  private async closeClient(): Promise<void> {
    if (!this.client) return;
    try {
      await (this.client as any).close?.();
    } catch {
      // Ignorer les erreurs de fermeture
    } finally {
      this.client = undefined;
    }
  }
}
