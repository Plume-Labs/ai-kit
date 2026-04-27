import { Inject, Injectable, Logger } from '@nestjs/common';
import { StructuredTool } from '@langchain/core/tools';
import { EmbeddingsInterface } from '@langchain/core/embeddings';
import { AiKitModuleOptions } from '../module/ai-kit.config';
import { AI_KIT_OPTIONS } from '../module/ai-kit.tokens';

/**
 * Configuration de la sélection sémantique des outils.
 */
export interface IToolSelectionConfig {
  /**
   * Activer la sélection sémantique des outils (défaut : false).
   * Si désactivé, tous les outils sont transmis à l'agent.
   */
  enabled?: boolean;
  /**
   * Nombre maximum d'outils à transmettre à l'agent (défaut : 10).
   */
  topK?: number;
  /**
   * Seuil de similarité cosinus minimum [0–1] (défaut : 0).
   * Les outils dont le score est inférieur à ce seuil sont exclus.
   */
  minSimilarity?: number;
}

/**
 * Nombre minimal d'outils en-dessous duquel la sélection sémantique est ignorée.
 * Si la liste d'outils est inférieure ou égale à ce seuil, tous les outils sont retournés.
 */
const BYPASS_TOOL_COUNT = 5;

/**
 * Service de sélection sémantique des outils.
 *
 * Utilise la similarité cosinus entre le vecteur du prompt utilisateur
 * et les vecteurs des descriptions d'outils pour ne retenir que les
 * outils les plus pertinents, réduisant ainsi le bruit et les coûts en tokens.
 *
 * Les embeddings des outils sont mis en cache en mémoire (clé = texte de description)
 * pour éviter les appels redondants au modèle d'embedding.
 * Le cache est invalidé lors d'un rechargement du registre d'outils MCP.
 *
 * Comportement de bypass :
 * - Aucun modèle d'embedding configuré → retourne tous les outils.
 * - Nombre d'outils ≤ BYPASS_TOOL_COUNT → retourne tous les outils.
 * - `enabled` est false ou absent → retourne tous les outils.
 */
@Injectable()
export class ToolSelectorService {
  private readonly logger = new Logger(ToolSelectorService.name);

  /** Cache des embeddings d'outils : clé = texte de description, valeur = vecteur. */
  private readonly embeddingCache = new Map<string, number[]>();

  /** Modèle d'embedding fourni via AiKitModuleOptions. Peut être absent. */
  private readonly embeddings?: EmbeddingsInterface;

  constructor(
    @Inject(AI_KIT_OPTIONS)
    private readonly options: AiKitModuleOptions,
  ) {
    this.embeddings = options.embeddingsModel;
  }

  /**
   * Sélectionne les outils les plus pertinents par rapport au prompt.
   *
   * @param prompt   Texte de la requête utilisateur ou du prompt système.
   * @param tools    Liste complète des outils disponibles.
   * @param config   Configuration de la sélection (topK, minSimilarity).
   * @returns        Sous-ensemble trié par pertinence décroissante, ou liste complète si bypass.
   */
  async selectRelevantTools(
    prompt: string,
    tools: StructuredTool[],
    config?: IToolSelectionConfig,
  ): Promise<StructuredTool[]> {
    if (!config?.enabled) {
      return tools;
    }

    // Bypass si aucun modèle d'embedding n'est configuré
    if (!this.embeddings) {
      this.logger.warn(
        "[AiKit] ToolSelectorService : aucun modèle d'embedding configuré (embeddingsModel manquant). " +
          "Tous les outils sont transmis à l'agent.",
      );
      return tools;
    }

    // Bypass si la liste d'outils est trop courte pour que la sélection soit utile
    if (tools.length <= BYPASS_TOOL_COUNT) {
      return tools;
    }

    const topK = config.topK ?? 10;
    const minSimilarity = config.minSimilarity ?? 0;

    // Calcule l'embedding du prompt
    const promptEmbedding = await this.embeddings.embedQuery(prompt);

    // Calcule (ou récupère depuis le cache) l'embedding de chaque outil
    const scored: Array<{ tool: StructuredTool; score: number }> = await Promise.all(
      tools.map(async (tool) => {
        const text = `${tool.name}: ${tool.description}`;
        const toolEmbedding = await this.getToolEmbedding(text);
        const score = cosineSimilarity(promptEmbedding, toolEmbedding);
        return { tool, score };
      }),
    );

    // Filtre par seuil de similarité et trie par score décroissant
    const filtered = scored
      .filter((s) => s.score >= minSimilarity)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => s.tool);

    this.logger.debug(
      `[AiKit] ToolSelectorService : ${filtered.length}/${tools.length} outil(s) sélectionné(s) (topK=${topK}, minSimilarity=${minSimilarity})`,
    );

    return filtered;
  }

  /**
   * Invalide le cache des embeddings d'outils.
   * À appeler après un rechargement du registre MCP ou des outils personnalisés.
   */
  invalidateToolEmbeddingsCache(): void {
    this.embeddingCache.clear();
    this.logger.debug("[AiKit] ToolSelectorService : cache des embeddings d'outils invalidé.");
  }

  // ─── Privé ───────────────────────────────────────────────────────────────────

  /**
   * Retourne l'embedding d'un texte d'outil, depuis le cache ou calculé à la volée.
   */
  private async getToolEmbedding(text: string): Promise<number[]> {
    const cached = this.embeddingCache.get(text);
    if (cached) {
      return cached;
    }
    const embedding = await this.embeddings!.embedQuery(text);
    this.embeddingCache.set(text, embedding);
    return embedding;
  }
}

/**
 * Calcule la similarité cosinus entre deux vecteurs de même dimension.
 * Retourne 0 si l'un des vecteurs est nul.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
