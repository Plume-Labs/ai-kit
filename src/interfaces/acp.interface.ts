/**
 * Méthode d'authentification ACP de type "agent".
 */
export interface IAcpAuthMethodAgent {
  id: string;
  name: string;
  type?: 'agent';
  description?: string;
}

/**
 * Méthode d'authentification ACP via variables d'environnement.
 */
export interface IAcpAuthMethodEnvVar {
  id: string;
  name: string;
  type: 'env_var';
  link?: string;
  vars: Array<{
    name: string;
    label?: string;
    secret?: boolean;
    optional?: boolean;
  }>;
}

export type IAcpAuthMethod = IAcpAuthMethodAgent | IAcpAuthMethodEnvVar;

/**
 * Configuration d'un agent exposé via ACP.
 */
export interface IAcpAgentConfig {
  /** Nom unique de l'agent (utilisé pour le routage ACP) */
  name: string;
  /** Description visible par les clients ACP */
  description?: string;
  /** ID du modèle enregistré dans ModelService */
  modelId?: string;
  /** IDs des serveurs MCP à utiliser */
  mcpServerIds?: string[];
  /** Commandes slash personnalisées */
  commands?: Array<{ name: string; description: string }>;
}

/**
 * Options de configuration du serveur ACP.
 */
export interface IAcpServerConfig {
  /** Liste des agents à exposer */
  agents: IAcpAgentConfig | IAcpAgentConfig[];
  /** Méthodes d'authentification */
  authMethods?: IAcpAuthMethod[];
  /** Répertoire racine du workspace (pour FilesystemBackend) */
  workspaceRoot?: string;
  /** Port du serveur (défaut: 9000) */
  port?: number;
}
