import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AiKitModuleOptions } from '../module/ai-kit.config';
import { AI_KIT_OPTIONS } from '../module/ai-kit.tokens';
import {
  CheckpointerMemoryAdapter,
  IMemoryAdapter,
  IMemoryConfig,
  ISemanticMemoryAdapter,
  InMemoryAdapter,
} from '../interfaces/memory.interface';

const DEFAULT_MEMORY_ID = 'default';

/**
 * Registre des mémoires AiKit.
 *
 * Gere une mémoire par défaut et permet de resoudre un checkpointer
 * a partir d'un id de mémoire.
 */
@Injectable()
export class MemoryService implements OnModuleInit {
  private readonly registry = new Map<string, IMemoryAdapter>();
  private defaultMemoryId?: string;

  constructor(
    @Inject(AI_KIT_OPTIONS)
    private readonly options: AiKitModuleOptions,
  ) {}

  onModuleInit(): void {
    const memoryConfigs = this.options.memories ?? [];
    if (memoryConfigs.length) {
      this.registerMemories(memoryConfigs);
    }

    if (this.options.defaultMemoryId) {
      this.setDefaultMemory(this.options.defaultMemoryId);
    }

    // Compat asc : checkpointer historique (prioritaire sur l'in-memory par défaut)
    if (this.options.checkpointer && !this.registry.has(DEFAULT_MEMORY_ID)) {
      this.registerMemory({
        id: DEFAULT_MEMORY_ID,
        adapter: new CheckpointerMemoryAdapter(this.options.checkpointer),
        isDefault: true,
      });
    }

    if (this.registry.size === 0) {
      this.registerMemory({
        id: DEFAULT_MEMORY_ID,
        adapter: new InMemoryAdapter(),
        isDefault: true,
      });
    }

    if (!this.defaultMemoryId) {
      this.defaultMemoryId = this.registry.keys().next().value;
    }
  }

  registerMemories(configs: IMemoryConfig[]): void {
    for (const config of configs) {
      this.registerMemory(config);
    }
  }

  registerMemory(config: IMemoryConfig): void {
    this.registry.set(config.id, config.adapter);
    if (config.isDefault || !this.defaultMemoryId) {
      this.defaultMemoryId = config.id;
    }
  }

  setDefaultMemory(memoryId: string): void {
    if (!this.registry.has(memoryId)) {
      throw new Error(`[AiKit] Memoire introuvable : ${memoryId}`);
    }
    this.defaultMemoryId = memoryId;
  }

  resolve(memoryId?: string): IMemoryAdapter {
    const id = memoryId ?? this.defaultMemoryId;
    if (!id) {
      throw new Error('[AiKit] Aucune memoire configuree');
    }
    const memory = this.registry.get(id);
    if (!memory) {
      throw new Error(`[AiKit] Memoire introuvable : ${id}`);
    }
    return memory;
  }

  getCheckpointer(memoryId?: string): unknown {
    return this.resolve(memoryId).getCheckpointer();
  }

  /**
   * Résout un adaptateur sémantique par son id.
   * Lève une erreur si l'adaptateur ne supporte pas la recherche sémantique
   * (i.e. n'implémente pas ISemanticMemoryAdapter).
   */
  resolveSemanticStore(memoryId?: string): ISemanticMemoryAdapter {
    const adapter = this.resolve(memoryId);
    if (!this.isSemanticAdapter(adapter)) {
      const id = memoryId ?? this.defaultMemoryId;
      throw new Error(
        `[AiKit] L'adaptateur memoire '${id}' ne supporte pas la recherche semantique. ` +
          'Utilisez un ISemanticMemoryAdapter (ex: PgVectorMemoryAdapter, PgFullMemoryAdapter).',
      );
    }
    return adapter as ISemanticMemoryAdapter;
  }

  private isSemanticAdapter(adapter: IMemoryAdapter): boolean {
    return (
      typeof (adapter as any).search === 'function' &&
      typeof (adapter as any).store === 'function'
    );
  }

  listMemories(): Array<{ id: string; isDefault: boolean }> {
    return Array.from(this.registry.keys()).map((id) => ({
      id,
      isDefault: id === this.defaultMemoryId,
    }));
  }
}
