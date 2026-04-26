import { MemorySaver } from '@langchain/langgraph';

/**
 * Contrat de base d'une mémoire AiKit.
 *
 * Un utilisateur final peut implementer cette interface pour brancher
 * son propre backend de mémoire (Redis, Postgres, etc.).
 */
export interface IMemoryAdapter {
  /**
   * Retourne l'objet checkpointer compatible LangGraph.
   * Retourne null pour les adaptateurs sémantiques purs (pas de checkpointer).
   */
  getCheckpointer(): unknown;
}

/**
 * Entrée de mémoire consolidée, stockée dans un backend sémantique.
 */
export interface ConsolidatedMemoryEntry {
  /** Identifiant unique (généré par le backend) */
  id?: string;
  /** Identifiant du thread de conversation source */
  threadId?: string;
  /** Identifiant de l'utilisateur */
  userId?: string;
  /** Contenu textuel résumé ou extrait */
  content: string;
  /** Vecteur d'embedding (généré automatiquement si absent) */
  embedding?: number[];
  /** Métadonnées supplémentaires */
  metadata?: Record<string, unknown>;
  /** Date de création */
  createdAt?: Date;
}

/**
 * Options de recherche sémantique.
 */
export interface ISemanticSearchOptions {
  /** Filtrer par threadId */
  threadId?: string;
  /** Filtrer par userId */
  userId?: string;
  /** Nombre de résultats a retourner (défaut : 5) */
  k?: number;
}

/**
 * Adaptateur de mémoire sémantique (long terme).
 *
 * Étend IMemoryAdapter avec la capacité de stocker et rechercher
 * des entrées par similarité vectorielle.
 */
export interface ISemanticMemoryAdapter extends IMemoryAdapter {
  /**
   * Stocke une entrée de mémoire consolidée.
   * Génère l'embedding si absent.
   */
  store(entry: ConsolidatedMemoryEntry): Promise<ConsolidatedMemoryEntry>;

  /**
   * Recherche les entrées les plus proches sémantiquement de la requête.
   * @param query Texte ou vecteur de la requête.
   */
  search(
    query: string | number[],
    options?: ISemanticSearchOptions,
  ): Promise<ConsolidatedMemoryEntry[]>;
}

/**
 * Adaptateur composite : court terme (checkpointer) + long terme (sémantique).
 */
export interface ICompositeMemoryAdapter extends ISemanticMemoryAdapter {
  // Hérite de IMemoryAdapter.getCheckpointer() (court terme)
  // et de ISemanticMemoryAdapter.store/search (long terme)
}

/**
 * Configuration d'une mémoire enregistree dans MemoryService.
 */
export interface IMemoryConfig {
  /** Identifiant unique de la mémoire */
  id: string;
  /** Adaptateur concret de mémoire */
  adapter: IMemoryAdapter;
  /** Si true, devient la mémoire par défaut */
  isDefault?: boolean;
  /**
   * Type de l'adaptateur.
   * - 'checkpointer' : mémoire court terme uniquement (défaut)
   * - 'semantic'     : mémoire long terme uniquement (pas de checkpointer LangGraph)
   * - 'composite'    : les deux
   */
  type?: 'checkpointer' | 'semantic' | 'composite';
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
 * Memoire en RAM par défaut (MemorySaver LangGraph).
 */
export class InMemoryAdapter extends CheckpointerMemoryAdapter {
  constructor() {
    super(new MemorySaver());
  }
}
