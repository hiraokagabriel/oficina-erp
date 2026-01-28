/**
 * migrateToFirestore.ts
 * Funções auxiliares para migração de dados para o Firebase Firestore
 * 
 * ATENÇÃO: Este arquivo contém exemplos de uso.
 * Para migração real, use o DatabaseContext que já gerencia os dados.
 */

import { saveToFirestore, getAllFromFirestore, clearAllCollections } from '../services/firestoreService';
import { auth } from '../config/firebase';

/**
 * Exemplo: Migrar dados do contexto atual para Firestore
 * 
 * Use dentro de um componente que tenha acesso ao useDatabase():
 * 
 * ```tsx
 * import { useDatabase } from './context/DatabaseContext';
 * import { migrateContextToFirestore } from './utils/migrateToFirestore';
 * 
 * function MigrationButton() {
 *   const db = useDatabase();
 *   
 *   const handleMigrate = async () => {
 *     await migrateContextToFirestore(db);
 *   };
 *   
 *   return <button onClick={handleMigrate}>Migrar</button>;
 * }
 * ```
 */
export async function migrateContextToFirestore(databaseContext: any): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('❌ Usuário não autenticado. Faça login antes de migrar.');
  }

  console.log('\n🚀 Iniciando migração para Firestore...');
  console.log(`👤 Usuário: ${auth.currentUser.email}`);
  console.log('='.repeat(60));

  const collections = [
    { name: 'clientes', data: databaseContext.clients || [] },
    { name: 'processos', data: databaseContext.workOrders || [] },
    { name: 'financeiro', data: databaseContext.ledger || [] },
    { name: 'catalogParts', data: databaseContext.catalogParts || [] },
    { name: 'catalogServices', data: databaseContext.catalogServices || [] }
  ];

  for (const collection of collections) {
    try {
      console.log(`\n📂 Migrando: ${collection.name}`);
      console.log(`   📦 Itens: ${collection.data.length}`);

      if (collection.data.length > 0) {
        await saveToFirestore(collection.name, collection.data);
        console.log(`   ✅ Migrado com sucesso!`);
      } else {
        console.log(`   ⚠️ Coleção vazia`);
      }
    } catch (error: any) {
      console.error(`   ❌ Erro:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 Migração concluída!');
}

/**
 * Verifica dados no Firestore
 */
export async function checkFirestoreData(): Promise<void> {
  const collections = ['clientes', 'processos', 'financeiro', 'catalogParts', 'catalogServices'];

  console.log('\n🔍 Verificando dados no Firestore...');
  console.log('='.repeat(60));

  for (const collectionName of collections) {
    try {
      const data = await getAllFromFirestore(collectionName);
      console.log(`📂 ${collectionName}: ${data.length} itens`);
    } catch (error: any) {
      console.log(`❌ ${collectionName}: Erro - ${error.message}`);
    }
  }

  console.log('='.repeat(60) + '\n');
}

/**
 * CUIDADO: Limpa TODOS os dados do Firestore
 */
export async function resetFirestore(): Promise<void> {
  const confirmação = confirm(
    '⚠️ ATENÇÃO: Isso irá DELETAR TODOS os dados do Firestore!\n\nTem certeza?'
  );

  if (!confirmação) {
    console.log('❌ Operação cancelada.');
    return;
  }

  const confirmação2 = confirm(
    '⚠️ Última confirmação:\n\nEsta ação é IRREVERSÍVEL!\n\nContinuar?'
  );

  if (!confirmação2) {
    console.log('❌ Operação cancelada.');
    return;
  }

  console.log('\n🗑️ Limpando Firestore...');
  await clearAllCollections();
  console.log('✅ Firestore limpo com sucesso!');
}

// Exportar para uso no console (opcional)
if (typeof window !== 'undefined') {
  (window as any).checkFirestoreData = checkFirestoreData;
  (window as any).resetFirestore = resetFirestore;
}
