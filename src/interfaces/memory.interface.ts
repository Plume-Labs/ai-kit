import { MemorySaver } from '@langchain/langgraph';

/**
 * Contrat d'une memoire AiKit.
 *
 * Un utilisateur final peut implementer cette interface pour brancher
 * son propre backend de memoire (Redis, Postgres, etc.).
 */
export interface IMemoryAdapter {
  /**
   * Retourne l'objet checkpointer compatible LangGraph.
   */
  getCheckpointer(): unknown;
}

/**
 * Configuration d'une memoire enregistree dans MemoryService.
 */
export interface IMemoryConfig {
  /** Identifiant unique de la memoire */
  id: string;
  /** Adaptateur concret de memoire */
  adapter: IMemoryAdapter;
  /** Si true, devient la memoire par defaut */
  isDefault?: boolean;
}

/**
 * Adaptateur generique qui encapsule un checkpointer existant.
 */
export class CheckpointerMemoryAdapter implements IMemoryAdapter {
  constructor(private readonly checkpointer: unknown) {}

  getCheckpointer(): unknown {
    return this.checkpointer;
  }
}

/**
 * Memoire en RAM par defaut (MemorySaver LangGraph).
 */
export class InMemoryAdapter extends CheckpointerMemoryAdapter {
  constructor() {
    super(new MemorySaver());
  }
}
