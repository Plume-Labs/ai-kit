import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { StructuredTool } from '@langchain/core/tools';
import { AiKitModuleOptions } from '../module/ai-kit.config';
import { AI_KIT_OPTIONS } from '../module/ai-kit.tokens';
import { ISecurityToolConfig, ISecurityToolDescriptor } from '../interfaces/security-tool.interface';
import { SecurityToolFactory } from './security-tool.factory';
import { McpService } from '../services/mcp.service';

/**
 * Registre des outils de sécurité prêts à l'emploi.
 * Les outils sont compilés en StructuredTool et injectés dans McpService.
 */
@Injectable()
export class SecurityToolService implements OnModuleInit {
  private readonly factory = new SecurityToolFactory();
  private readonly registry = new Map<string, StructuredTool>();
  private readonly descriptors = new Map<string, ISecurityToolDescriptor>();

  constructor(
    @Inject(AI_KIT_OPTIONS)
    private readonly options: AiKitModuleOptions,
    private readonly mcpService: McpService,
  ) {}

  onModuleInit(): void {
    if (this.options.securityTools?.length) {
      this.registerTools(this.options.securityTools);
    }
  }

  registerTools(configs: ISecurityToolConfig[]): void {
    for (const config of configs) {
      this.registerTool(config);
    }
  }

  registerTool(config: ISecurityToolConfig): StructuredTool {
    const tool = this.factory.create(config);

    this.registry.set(config.id, tool);
    this.descriptors.set(config.id, {
      id: config.id,
      preset: config.preset,
      name: tool.name,
      description: tool.description,
    });

    this.mcpService.registerTool(config.id, tool);

    return tool;
  }

  getTool(id: string): StructuredTool {
    const tool = this.registry.get(id);
    if (!tool) {
      throw new Error(`[AiKit] Outil de sécurité introuvable : ${id}`);
    }
    return tool;
  }

  listTools(): ISecurityToolDescriptor[] {
    return Array.from(this.descriptors.values());
  }

  /**
   * @internal Retourne les outils compilés pour intégration interne.
   */
  _getInternalTools(): StructuredTool[] {
    return Array.from(this.registry.values());
  }
}
