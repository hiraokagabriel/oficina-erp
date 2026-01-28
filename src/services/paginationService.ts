/**
 * paginationService.ts
 * Serviço de paginação para grandes coleções
 * 
 * BENEFÍCIOS:
 * - Carrega apenas 50-100 itens por vez
 * - Reduz uso de memória
 * - Melhora performance inicial
 * - Suporta scroll infinito
 */

import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  QueryDocumentSnapshot,
  DocumentData,
  QueryConstraint,
  where
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { auth } from '../config/firebase';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export interface PaginationOptions {
  pageSize?: number;
  orderByField?: string;
  orderDirection?: 'asc' | 'desc';
  filters?: QueryConstraint[];
}

export interface PaginationResult<T> {
  items: T[];
  hasMore: boolean;
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  totalFetched: number;
}

export interface PaginationState<T> {
  items: T[];
  isLoading: boolean;
  hasMore: boolean;
  error: string | null;
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  totalFetched: number;
}

/**
 * Classe para gerenciar paginação de coleções Firestore
 */
export class PaginationService<T = any> {
  private collectionName: string;
  private pageSize: number;
  private orderByField: string;
  private orderDirection: 'asc' | 'desc';
  private filters: QueryConstraint[];
  private lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  private allItems: T[] = [];
  private userId: string;

  constructor(
    collectionName: string,
    options: PaginationOptions = {}
  ) {
    const user = auth.currentUser;
    if (!user) throw new Error('Usuário não autenticado');
    
    this.userId = user.uid;
    this.collectionName = collectionName;
    this.pageSize = Math.min(options.pageSize || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    this.orderByField = options.orderByField || 'createdAt';
    this.orderDirection = options.orderDirection || 'desc';
    this.filters = options.filters || [];
  }

  /**
   * Busca a primeira página
   */
  async fetchFirstPage(): Promise<PaginationResult<T>> {
    this.reset();
    return this.fetchNextPage();
  }

  /**
   * Busca a próxima página
   */
  async fetchNextPage(): Promise<PaginationResult<T>> {
    try {
      const collectionPath = `users/${this.userId}/${this.collectionName}`;
      
      // Construir query
      const constraints: QueryConstraint[] = [
        ...this.filters,
        orderBy(this.orderByField, this.orderDirection),
        limit(this.pageSize)
      ];

      // Se não é a primeira página, adicionar startAfter
      if (this.lastDoc) {
        constraints.push(startAfter(this.lastDoc));
      }

      const q = query(collection(db, collectionPath), ...constraints);
      const snapshot = await getDocs(q);

      const items: T[] = [];
      snapshot.forEach(doc => {
        items.push({ id: doc.id, ...doc.data() } as T);
      });

      // Atualizar estado
      this.allItems.push(...items);
      this.lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;

      const hasMore = snapshot.docs.length === this.pageSize;

      console.log(`📊 Paginação ${this.collectionName}: ${items.length} itens (total: ${this.allItems.length})`);

      return {
        items,
        hasMore,
        lastDoc: this.lastDoc,
        totalFetched: this.allItems.length
      };
    } catch (error) {
      console.error(`❌ Erro na paginação de ${this.collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Busca uma página específica (menos eficiente, use com cuidado)
   */
  async fetchPage(pageNumber: number): Promise<PaginationResult<T>> {
    if (pageNumber < 1) throw new Error('Número de página inválido');
    
    this.reset();
    
    // Pular páginas até chegar na desejada
    let result: PaginationResult<T> | null = null;
    for (let i = 0; i < pageNumber; i++) {
      result = await this.fetchNextPage();
      if (!result.hasMore && i < pageNumber - 1) {
        throw new Error('Página não existe');
      }
    }
    
    return result!;
  }

  /**
   * Busca todos os itens (com lazy loading)
   */
  async fetchAll(
    onProgress?: (current: number, estimated: number) => void
  ): Promise<T[]> {
    this.reset();
    
    let hasMore = true;
    let totalFetched = 0;

    while (hasMore) {
      const result = await this.fetchNextPage();
      totalFetched = result.totalFetched;
      hasMore = result.hasMore;

      if (onProgress) {
        // Estimar total baseado no tamanho da página
        const estimated = hasMore ? totalFetched * 2 : totalFetched;
        onProgress(totalFetched, estimated);
      }
    }

    console.log(`✅ ${this.collectionName}: ${totalFetched} itens carregados`);
    return this.allItems;
  }

  /**
   * Busca itens até encontrar um específico (busca lazy)
   */
  async fetchUntil(
    predicate: (item: T) => boolean,
    maxPages: number = 10
  ): Promise<T | null> {
    this.reset();
    
    for (let page = 0; page < maxPages; page++) {
      const result = await this.fetchNextPage();
      
      const found = result.items.find(predicate);
      if (found) return found;
      
      if (!result.hasMore) break;
    }
    
    return null;
  }

  /**
   * Retorna todos os itens já carregados
   */
  getAllLoaded(): T[] {
    return [...this.allItems];
  }

  /**
   * Verifica se tem mais páginas
   */
  hasNextPage(): boolean {
    return this.lastDoc !== null;
  }

  /**
   * Reseta o estado da paginação
   */
  reset(): void {
    this.lastDoc = null;
    this.allItems = [];
  }

  /**
   * Atualiza filtros e reinicia
   */
  setFilters(filters: QueryConstraint[]): void {
    this.filters = filters;
    this.reset();
  }

  /**
   * Atualiza ordenação e reinicia
   */
  setOrdering(field: string, direction: 'asc' | 'desc' = 'desc'): void {
    this.orderByField = field;
    this.orderDirection = direction;
    this.reset();
  }
}

/**
 * Factory functions para coleções comuns
 */
export function createClientsPagination(pageSize: number = 50) {
  return new PaginationService('clients', {
    pageSize,
    orderByField: 'name',
    orderDirection: 'asc'
  });
}

export function createWorkOrdersPagination(pageSize: number = 50) {
  return new PaginationService('workOrders', {
    pageSize,
    orderByField: 'createdAt',
    orderDirection: 'desc'
  });
}

export function createLedgerPagination(pageSize: number = 50) {
  return new PaginationService('ledger', {
    pageSize,
    orderByField: 'effectiveDate',
    orderDirection: 'desc'
  });
}

export function createCatalogPagination(
  type: 'parts' | 'services',
  pageSize: number = 100
) {
  const collectionName = type === 'parts' ? 'catalogParts' : 'catalogServices';
  return new PaginationService(collectionName, {
    pageSize,
    orderByField: 'name',
    orderDirection: 'asc'
  });
}

/**
 * Hook helper para React (pseudo-código, adaptar para seu caso)
 */
export function usePagination<T>(
  collectionName: string,
  options: PaginationOptions = {}
): PaginationState<T> & {
  loadMore: () => Promise<void>;
  reset: () => void;
  refresh: () => Promise<void>;
} {
  // Este é um exemplo de como usar no React
  // Implemente usando useState e useEffect no componente real
  throw new Error('Use usePagination implementation in your React component');
}
