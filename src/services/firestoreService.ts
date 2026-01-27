import { db } from '../lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  Timestamp,
  enableIndexedDbPersistence,
  enableMultiTabIndexedDbPersistence
} from 'firebase/firestore';

/**
 * Habilita persistência offline do Firestore
 * Os dados são salvos localmente e sincronizados automaticamente
 */
export async function enableOfflinePersistence() {
  try {
    // Tenta habilitar persistência multi-tab (melhor)
    await enableMultiTabIndexedDbPersistence(db);
    console.log('✅ Persistência offline multi-tab habilitada');
  } catch (err: any) {
    if (err.code === 'failed-precondition') {
      // Múltiplas abas abertas, fallback para single-tab
      try {
        await enableIndexedDbPersistence(db);
        console.log('✅ Persistência offline single-tab habilitada');
      } catch (persistErr) {
        console.warn('⚠️ Persistência offline não suportada');
      }
    } else if (err.code === 'unimplemented') {
      console.warn('⚠️ Navegador não suporta persistência offline');
    }
  }
}

/**
 * Interface base para documentos
 */
export interface BaseDocument {
  id: string;
  userId: string; // Multi-tenancy: cada usuário tem seus dados
  createdAt: Date;
  updatedAt: Date;
  syncedAt?: Date; // Última sincronização
}

/**
 * Interface para clientes
 */
export interface Cliente extends BaseDocument {
  nome: string;
  email?: string;
  telefone?: string;
  cpfCnpj?: string;
  endereco?: string;
  observacoes?: string;
}

/**
 * Interface para veículos
 */
export interface Veiculo extends BaseDocument {
  clienteId: string;
  marca: string;
  modelo: string;
  ano: number;
  placa: string;
  cor?: string;
  km?: number;
}

/**
 * Interface para serviços/orçamentos
 */
export interface Servico extends BaseDocument {
  clienteId: string;
  veiculoId?: string;
  descricao: string;
  valor: number;
  status: 'orçamento' | 'aprovado' | 'em_andamento' | 'concluído' | 'cancelado';
  dataInicio?: Date;
  dataFim?: Date;
  observacoes?: string;
}

/**
 * Classe genérica para operações CRUD
 */
export class FirestoreCollection<T extends BaseDocument> {
  private collectionName: string;

  constructor(collectionName: string) {
    this.collectionName = collectionName;
  }

  /**
   * Cria um novo documento
   */
  async create(userId: string, data: Omit<T, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const docRef = doc(collection(db, this.collectionName));
    const now = new Date();
    
    const newDoc: T = {
      ...data,
      id: docRef.id,
      userId,
      createdAt: now,
      updatedAt: now,
      syncedAt: now
    } as T;

    await setDoc(docRef, {
      ...newDoc,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
      syncedAt: Timestamp.fromDate(now)
    });

    console.log(`✅ Documento criado em ${this.collectionName}:`, docRef.id);
    return newDoc;
  }

  /**
   * Busca um documento por ID
   */
  async getById(userId: string, id: string): Promise<T | null> {
    const docRef = doc(db, this.collectionName, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    
    // Verifica se o documento pertence ao usuário (multi-tenancy)
    if (data.userId !== userId) {
      console.warn('⚠️ Tentativa de acesso não autorizado');
      return null;
    }

    return this.convertTimestamps(data) as T;
  }

  /**
   * Busca todos os documentos do usuário
   */
  async getAll(userId: string, orderByField?: keyof T, limitCount?: number): Promise<T[]> {
    const collectionRef = collection(db, this.collectionName);
    let q = query(collectionRef, where('userId', '==', userId));

    if (orderByField) {
      q = query(q, orderBy(orderByField as string, 'desc'));
    }

    if (limitCount) {
      q = query(q, limit(limitCount));
    }

    const querySnapshot = await getDocs(q);
    const docs: T[] = [];

    querySnapshot.forEach((doc) => {
      docs.push(this.convertTimestamps(doc.data()) as T);
    });

    console.log(`📊 ${docs.length} documentos encontrados em ${this.collectionName}`);
    return docs;
  }

  /**
   * Atualiza um documento
   */
  async update(userId: string, id: string, data: Partial<Omit<T, 'id' | 'userId' | 'createdAt'>>): Promise<void> {
    // Verifica permissão
    const existing = await this.getById(userId, id);
    if (!existing) {
      throw new Error('Documento não encontrado ou sem permissão');
    }

    const docRef = doc(db, this.collectionName, id);
    const now = new Date();

    await updateDoc(docRef, {
      ...data,
      updatedAt: Timestamp.fromDate(now),
      syncedAt: Timestamp.fromDate(now)
    });

    console.log(`✅ Documento atualizado em ${this.collectionName}:`, id);
  }

  /**
   * Deleta um documento
   */
  async delete(userId: string, id: string): Promise<void> {
    // Verifica permissão
    const existing = await this.getById(userId, id);
    if (!existing) {
      throw new Error('Documento não encontrado ou sem permissão');
    }

    const docRef = doc(db, this.collectionName, id);
    await deleteDoc(docRef);

    console.log(`🗑️ Documento deletado de ${this.collectionName}:`, id);
  }

  /**
   * Deleta todos os documentos do usuário (usado em reset)
   */
  async deleteAll(userId: string): Promise<number> {
    const docs = await this.getAll(userId);
    const batch = writeBatch(db);
    let count = 0;

    docs.forEach((doc) => {
      const docRef = doc(db, this.collectionName, doc.id);
      batch.delete(docRef);
      count++;
    });

    await batch.commit();
    console.log(`🗑️ ${count} documentos deletados de ${this.collectionName}`);
    return count;
  }

  /**
   * Importa múltiplos documentos (usado em restore)
   */
  async importBatch(userId: string, documents: Omit<T, 'userId' | 'syncedAt'>[]): Promise<number> {
    const batch = writeBatch(db);
    const now = new Date();
    let count = 0;

    documents.forEach((data) => {
      const docRef = doc(collection(db, this.collectionName), data.id);
      batch.set(docRef, {
        ...data,
        userId,
        createdAt: data.createdAt ? Timestamp.fromDate(new Date(data.createdAt)) : Timestamp.fromDate(now),
        updatedAt: data.updatedAt ? Timestamp.fromDate(new Date(data.updatedAt)) : Timestamp.fromDate(now),
        syncedAt: Timestamp.fromDate(now)
      });
      count++;
    });

    await batch.commit();
    console.log(`✅ ${count} documentos importados para ${this.collectionName}`);
    return count;
  }

  /**
   * Converte Timestamps do Firestore para Date
   */
  private convertTimestamps(data: any): any {
    const converted = { ...data };
    
    if (data.createdAt?.toDate) {
      converted.createdAt = data.createdAt.toDate();
    }
    if (data.updatedAt?.toDate) {
      converted.updatedAt = data.updatedAt.toDate();
    }
    if (data.syncedAt?.toDate) {
      converted.syncedAt = data.syncedAt.toDate();
    }
    if (data.dataInicio?.toDate) {
      converted.dataInicio = data.dataInicio.toDate();
    }
    if (data.dataFim?.toDate) {
      converted.dataFim = data.dataFim.toDate();
    }

    return converted;
  }
}

// Instâncias globais das coleções
export const clientesCollection = new FirestoreCollection<Cliente>('clientes');
export const veiculosCollection = new FirestoreCollection<Veiculo>('veiculos');
export const servicosCollection = new FirestoreCollection<Servico>('servicos');
