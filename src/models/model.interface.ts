/**
 * Supported model provider types.
 * Ajouter ici de nouveaux providers sans impacter les utilisateurs.
 */
export type ModelProviderType = 'openai' | 'ollama' | 'anthropic' | 'azure-openai';

/**
 * Configuration d'un provider de modèle de langage.
 * Aucune dépendance envers LangChain.
 */
export interface IModelConfig {
  /** Identifiant unique du provider dans le module */
  id: string;
  /** Type du provider */
  provider: ModelProviderType;
  /** Nom ou identifiant du modèle (ex: "gpt-4o", "llama3") */
  modelName: string;
  /** Température (0-2, défaut: 0) */
  temperature?: number;
  /** Clé API (peut aussi être fournie par variable d'environnement) */
  apiKey?: string;
  /** URL de base pour les providers self-hosted (Ollama, Azure…) */
  baseUrl?: string;
  /** Options supplémentaires spécifiques au provider */
  extra?: Record<string, unknown>;
}

/**
 * Interface opaque exposée aux utilisateurs pour référencer un modèle.
 */
export interface IModelProvider {
  /** Identifiant enregistré dans le module */
  readonly id: string;
  /** Type de provider */
  readonly provider: ModelProviderType;
  /** Nom du modèle */
  readonly modelName: string;
}
