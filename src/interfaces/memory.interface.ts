import { MemorySaver } from '@langchain/langgraph';

/**
 * Contrat de base d'une memoire AiKit.
 *
 * Un utilisateur final peut implementer cette interface pour brancher
 * son propre backend de memoire (Redis, Postgres, etc.).
 */
export interface IMemoryAdapter {
  /**
   * Retourne l'objet checkpointer compatible LangGraph.
   * Retourne null pour les adaptateurs semantiques purs (pas de checkpointer).
   */
  getCheckpointer(): unknown;
}

/**
 * Entree de memoire consolidee, stockee dans un backend semantique.
 */
export interface ConsolidatedMemoryEntry {
  /** Identifiant unique (genere par le backend) */
  id?: string;
  /** Identifiant du thread de conversation source */
  threadId?: string;
  /** Identifiant de l'utilisateur */
  userId?: string;
  /** Contenu textuel resume ou extrait */
  content: string;
  /** Vecteur d'embedding (genere automatiquement si absent) */
  embedding?: number[];
  /** Metadonnees supplementaires */
  metadata?: Record<string, unknown>;
  /** Date de creation */
  createdAt?: Date;
}

/**
 * Options de recherche semantique.
 */
export interface ISemanticSearchOptions {
  /** Filtrer par threadId */
  threadId?: string;
  /** Filtrer par userId */
  userId?: string;
  /** Nombre de resultats a retourner (defaut : 5) */
  k?: number;
}

/**
 * Adaptateur de memoire semantique (long terme).
 *
 * Etend IMemoryAdapter avec la capacite de stocker et rechercher
 * des entrees par similarite vectorielle.
 */
export interface ISemanticMemoryAdapter extends IMemoryAdapter {
  /**
   * Stocke une entree de memoire consolidee.
   * Genere l'embedding si absent.
   */
  store(entry: ConsolidatedMemoryEntry): Promise<ConsolidatedMemoryEntry>;

  /**
   * Recherche les entrees les plus proches semantiquement de la requete.
   * @param query Texte ou vecteur de la requete.
   */
  search(
    query: string | number[],
    options?: ISemanticSearchOptions,
  ): Promise<ConsolidatedMemoryEntry[]>;
}

/**
 * Adaptateur composite : court terme (checkpointer) + long terme (semantique).
 */
export interface ICompositeMemoryAdapter extends ISemanticMemoryAdapter {
  // Hrite de IMemoryAdapter.getCheckpointer() (court terme)
  // et de ISemanticMemoryAdapter.store/search (long terme)
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
  /**
   * Type de l'adaptateur.
   * - 'checkpointer' : memoire court terme uniquement (defaut)
   * - 'semantic'     : memoire long terme uniquement (pas de checkpointer LangGraph)
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
 * Memoire en RAM par defaut (MemorySaver LangGraph).
 */
export class InMemoryAdapter extends CheckpointerMemoryAdapter {
  constructor() {
    super(new MemorySaver());
  }
}
