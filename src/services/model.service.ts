import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { IModelConfig, IModelProvider } from '../interfaces/model.interface';
import { buildChatModel } from '../factories/models/model.factory';
import { AiKitModuleOptions } from '../module/ai-kit.config';
import { AI_KIT_OPTIONS } from '../module/ai-kit.tokens';

/**
 * Service de gestion des modèles de langage.
 * Expose une interface stable — les utilisateurs ne manipulent jamais BaseChatModel directement.
 */
@Injectable()
export class ModelService implements OnModuleInit {
  private readonly models = new Map<string, BaseChatModel>();
  private readonly configs = new Map<string, IModelConfig>();
  private defaultModelId?: string;

  constructor(
    @Inject(AI_KIT_OPTIONS)
    private readonly options: AiKitModuleOptions,
  ) {}

  onModuleInit(): void {
    this.registerModels(this.options.models ?? []);
  }

  /**
   * Enregistre (ou met à jour) plusieurs modèles.
   */
  registerModels(configs: IModelConfig[]): void {
    for (const config of configs) {
      this.registerModel(config);
    }
  }

  /**
   * Enregistre (ou met à jour) un modèle.
   */
  registerModel(config: IModelConfig): void {
    const model = buildChatModel(config);
    this.models.set(config.id, model);
    this.configs.set(config.id, config);
    if (!this.defaultModelId) {
      this.defaultModelId = config.id;
    }
  }

  /**
   * Retourne un IModelProvider (opaque) pour l'id demandé.
   * Lève une erreur si le modèle n'est pas enregistré.
   */
  getModelProvider(modelId?: string): IModelProvider {
    const id = modelId ?? this.defaultModelId;
    if (!id) {
      throw new Error('[AiKit] Aucun modèle configuré dans AiKitModuleOptions.models');
    }
    const config = this.configs.get(id);
    if (!config) {
      throw new Error(`[AiKit] Modèle introuvable : ${id}`);
    }
    return { id: config.id, provider: config.provider, modelName: config.modelName };
  }

  /**
   * Retourne la liste de tous les providers enregistrés.
   */
  listProviders(): IModelProvider[] {
    return Array.from(this.configs.values()).map((c) => ({
      id: c.id,
      provider: c.provider,
      modelName: c.modelName,
    }));
  }

  /**
   * @internal — Accès au modèle natif, réservé aux autres services du module.
   */
  _getInternalModel(modelId?: string): BaseChatModel {
    const id = modelId ?? this.defaultModelId;
    if (!id) throw new Error('[AiKit] Aucun modèle configuré');
    const model = this.models.get(id);
    if (!model) throw new Error(`[AiKit] Modèle introuvable : ${id}`);
    return model;
  }
}
