import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import { IModelConfig } from './model.interface';

/**
 * Factory interne : instancie le bon BaseChatModel selon le provider.
 * N'est jamais exposé aux utilisateurs finaux.
 */
export function buildChatModel(config: IModelConfig): BaseChatModel {
  switch (config.provider) {
    case 'openai':
      return new ChatOpenAI({
        model: config.modelName,
        temperature: config.temperature ?? 0,
        apiKey: config.apiKey,
        ...(config.extra as Record<string, unknown>),
      });

    case 'azure-openai':
      return new ChatOpenAI({
        model: config.modelName,
        temperature: config.temperature ?? 0,
        apiKey: config.apiKey,
        configuration: {
          baseURL: config.baseUrl,
        },
        ...(config.extra as Record<string, unknown>),
      });

    case 'ollama':
      return new ChatOllama({
        model: config.modelName,
        temperature: config.temperature ?? 0,
        baseUrl: config.baseUrl ?? 'http://localhost:11434',
        ...(config.extra as Record<string, unknown>),
      });

    case 'anthropic': {
      // @langchain/anthropic est optionnel — chargement dynamique
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ChatAnthropic } = require('@langchain/anthropic');
      return new ChatAnthropic({
        model: config.modelName,
        temperature: config.temperature ?? 0,
        apiKey: config.apiKey,
        ...(config.extra as Record<string, unknown>),
      });
    }

    default:
      throw new Error(`[AiKit] Provider non supporté : ${(config as IModelConfig).provider}`);
  }
}
