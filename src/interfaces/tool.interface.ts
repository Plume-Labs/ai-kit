import { StructuredTool } from '@langchain/core/tools';

/**
 * Représentation d'un outil (tool) exposé aux agents.
 * Abstraction sur StructuredTool de LangChain.
 */
export interface ITool {
  /** Nom de l'outil */
  name: string;
  /** Description fonctionnelle */
  description: string;
  /** Schéma JSON des paramètres d'entrée */
  inputSchema?: Record<string, unknown>;
}

/**
 * Configuration d'un outil personnalisé à enregistrer.
 */
export interface IToolConfig {
  /** Identifiant unique de l'outil */
  id: string;
  /** L'implémentation de l'outil (StructuredTool de LangChain) */
  tool: StructuredTool;
}

/**
 * Configuration d'un serveur MCP (stdio transport).
 */
export interface IMcpStdioServerConfig {
  transport: 'stdio';
  /** Commande à exécuter pour démarrer le serveur MCP */
  command: string;
  /** Arguments de la commande */
  args?: string[];
  /** Variables d'environnement supplémentaires */
  env?: Record<string, string>;
}

/**
 * Configuration d'un serveur MCP (SSE/HTTP transport).
 */
export interface IMcpSseServerConfig {
  transport: 'sse';
  /** URL du serveur SSE */
  url: string;
  /** Headers HTTP supplémentaires */
  headers?: Record<string, string>;
}

/**
 * Configuration d'un serveur MCP (union discriminante).
 */
export type IMcpServerConfig = (IMcpStdioServerConfig | IMcpSseServerConfig) & {
  /** Identifiant unique du serveur MCP */
  id: string;
};
