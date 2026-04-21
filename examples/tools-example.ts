/**
 * Exemple complet : Injection d'outils personnalisés avec @InjectTool
 * 
 * Ce fichier montre comment :
 * 1. Créer des outils personnalisés avec LangChain
 * 2. Les enregistrer via forRoot() ou forFeature()
 * 3. Les injecter dans un service avec @InjectTool()
 * 4. Les utiliser directement dans les agents
 */

import { Injectable, Module } from '@nestjs/common';
import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { StructuredTool } from '@langchain/core/tools';
import { AiKitModule, InjectTool, IToolConfig } from 'ai-kit';

// ─── 1. Créer des outils personnalisés ────────────────────────────────────────

/**
 * Outil de recherche (simulé)
 */
const searchTool = tool(
  async ({ query }: { query: string }) => {
    // Implémentation réelle : appel API, requête BD, etc.
    return `Résultats pour "${query}": Article 1, Article 2, Article 3`;
  },
  {
    name: 'search',
    description: 'Effectue une recherche par mots-clés.',
    schema: z.object({
      query: z.string().describe('Requête de recherche'),
    }),
  },
);

/**
 * Outil de calcul (simulé)
 */
const calculateTool = tool(
  async ({ expression }: { expression: string }) => {
    try {
      // En production, utiliser un évaluateur sécurisé
      const result = eval(expression);
      return `Résultat : ${result}`;
    } catch (err) {
      return `Erreur : ${err}`;
    }
  },
  {
    name: 'calculate',
    description: 'Évalue une expression mathématique.',
    schema: z.object({
      expression: z.string().describe('Expression à évaluer (ex: "2 + 2")'),
    }),
  },
);

/**
 * Outil de conversion de devises (simulé)
 */
const convertCurrencyTool = tool(
  async ({ amount, from, to }: { amount: number; from: string; to: string }) => {
    // Simulé : en production, utiliser une API de taux de change
    const rates = { EUR: 1, USD: 1.1, GBP: 0.9 };
    const rate = (rates[to as keyof typeof rates] || 1) / (rates[from as keyof typeof rates] || 1);
    const result = (amount * rate).toFixed(2);
    return `${amount} ${from} = ${result} ${to}`;
  },
  {
    name: 'convert_currency',
    description: 'Convertit une devise en une autre.',
    schema: z.object({
      amount: z.number().describe('Montant à convertir'),
      from: z.string().describe('Devise source (ex: EUR, USD)'),
      to: z.string().describe('Devise cible (ex: USD, GBP)'),
    }),
  },
);

// ─── 2. Enregistrer via forRoot() ─────────────────────────────────────────────

export const exampleForRootConfig = {
  models: [
    {
      id: 'gpt4o',
      provider: 'openai' as const,
      modelName: 'gpt-4o',
    },
  ],
  tools: [
    { id: 'search', tool: searchTool },
    { id: 'calculate', tool: calculateTool },
    { id: 'convert_currency', tool: convertCurrencyTool },
  ] as IToolConfig[],
};

// ─── 3. Ou enregistrer via forFeature() ───────────────────────────────────────

export const exampleForFeatureConfig = {
  agents: [
    {
      id: 'assistant',
      modelId: 'gpt4o',
      systemPrompt: 'Tu es un assistant polyvalent avec accès à des outils.',
    },
  ],
  tools: [
    { id: 'search', tool: searchTool },
    { id: 'calculate', tool: calculateTool },
  ] as IToolConfig[],
};

// ─── 4. Injecter et utiliser dans un service ─────────────────────────────────

@Injectable()
export class ToolsExampleService {
  constructor(
    @InjectTool('search')
    private readonly searchTool: StructuredTool,

    @InjectTool('calculate')
    private readonly calculateTool: StructuredTool,

    @InjectTool('convert_currency')
    private readonly convertCurrencyTool: StructuredTool,
  ) {}

  /**
   * Effectue une recherche
   */
  async performSearch(query: string): Promise<string> {
    const result = await this.searchTool.invoke({ query });
    return String(result);
  }

  /**
   * Effectue un calcul
   */
  async performCalculation(expression: string): Promise<string> {
    const result = await this.calculateTool.invoke({ expression });
    return String(result);
  }

  /**
   * Convertit une devise
   */
  async convertCurrency(amount: number, from: string, to: string): Promise<string> {
    const result = await this.convertCurrencyTool.invoke({ amount, from, to });
    return String(result);
  }
}

// ─── 5. Module exemple ────────────────────────────────────────────────────────

@Module({
  imports: [
    AiKitModule.forFeature(exampleForFeatureConfig),
  ],
  providers: [ToolsExampleService],
  exports: [ToolsExampleService],
})
export class ToolsExampleModule {}
