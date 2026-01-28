/**
 * hashUtils.ts
 * Utilitários para criar hashes de conteúdo e comparar dados
 * Usado para evitar escritas desnecessárias no Firebase
 */

/**
 * Cria um hash simples de uma string usando algoritmo djb2
 * Rápido e adequado para comparação de conteúdo
 */
export function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return hash >>> 0; // Convert to unsigned 32-bit integer
}

/**
 * Cria um hash de um objeto (serializa como JSON e faz hash)
 */
export function hashObject(obj: any): number {
  // Remove campos de metadata que sempre mudam
  const cleanObj = removeMetadata(obj);
  const str = JSON.stringify(cleanObj, Object.keys(cleanObj).sort());
  return hashString(str);
}

/**
 * Remove campos de metadata que não devem ser considerados na comparação
 */
function removeMetadata(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  const clean = { ...obj };
  delete clean.syncedAt;
  delete clean.updatedAt;
  delete clean.userId;
  delete clean._hash;
  
  return clean;
}

/**
 * Compara dois objetos por hash para ver se mudaram
 */
export function hasContentChanged(oldObj: any, newObj: any): boolean {
  const oldHash = hashObject(oldObj);
  const newHash = hashObject(newObj);
  return oldHash !== newHash;
}

/**
 * Adiciona hash a um objeto para comparação futura
 */
export function addHash<T extends object>(obj: T): T & { _hash: number } {
  return {
    ...obj,
    _hash: hashObject(obj)
  };
}

/**
 * Filtra array de objetos removendo duplicatas baseado em hash
 */
export function deduplicateByHash<T extends object>(items: T[]): T[] {
  const seen = new Set<number>();
  return items.filter(item => {
    const hash = hashObject(item);
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true;
  });
}
