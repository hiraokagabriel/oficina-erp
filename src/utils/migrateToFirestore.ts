/**
 * migrateToFirestore.ts
 * Script para migrar dados do IndexedDB para o Firebase Firestore
 * Execute este script UMA VEZ após configurar o Firebase
 */

import { getAllFromLocal, STORES } from '../services/storageService';
import { saveToFirestore, clearAllCollections } from '../services/firestoreService';
import { auth } from '../config/firebase';

interface MigrationResult {
  success: boolean;
  collection: string;
  itemsCount: number;
  error?: string;
}

/**
 * Migra todos os dados do IndexedDB para o Firestore
 */
export async function migrateAllToFirestore(): Promise<MigrationResult[]> {
  // Verificar se o usuário está autenticado
  if (!auth.currentUser) {
    throw new Error('❌ Usuário não autenticado. Faça login antes de migrar.');
  }

  console.log('\n🚀 Iniciando migração IndexedDB → Firestore...');
  console.log(`👤 Usuário: ${auth.currentUser.email}`);
  console.log('='  .repeat(60));

  const results: MigrationResult[] = [];

  for (const collectionName of Object.values(STORES)) {
    try {
      console.log(`\n📂 Migrando: ${collectionName}`);

      // 1. Buscar dados do IndexedDB
      const localData = await getAllFromLocal<any>(collectionName);
      console.log(`   📦 Encontrados: ${localData.length} itens`);

      if (localData.length === 0) {
        console.log(`   ⚠️ Coleção vazia, pulando...`);
        results.push({
          success: true,
          collection: collectionName,
          itemsCount: 0
        });
        continue;
      }

      // 2. Salvar no Firestore
      await saveToFirestore(collectionName, localData);
      console.log(`   ✅ ${localData.length} itens migrados com sucesso!`);

      results.push({
        success: true,
        collection: collectionName,
        itemsCount: localData.length
      });

    } catch (error: any) {
      console.error(`   ❌ Erro ao migrar ${collectionName}:`, error.message);
      results.push({
        success: false,
        collection: collectionName,
        itemsCount: 0,
        error: error.message
      });
    }
  }

  // Sumário
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO DA MIGRAÇÃO');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalItems = results.reduce((sum, r) => sum + r.itemsCount, 0);

  console.log(`\n✅ Sucesso: ${successful}/${results.length} coleções`);
  console.log(`❌ Falhas: ${failed}/${results.length} coleções`);
  console.log(`📦 Total de itens migrados: ${totalItems}`);

  // Detalhes
  console.log('\n📝 Detalhes:');
  results.forEach(result => {
    const icon = result.success ? '✅' : '❌';
    console.log(`   ${icon} ${result.collection}: ${result.itemsCount} itens`);
    if (result.error) {
      console.log(`      ⚠️ Erro: ${result.error}`);
    }
  });

  console.log('\n🎉 Migração concluída!');
  console.log('='  .repeat(60) + '\n');

  return results;
}

/**
 * Verifica se já existem dados no Firestore
 */
export async function checkFirestoreData(): Promise<Record<string, number>> {
  const { getAllFromFirestore } = await import('../services/firestoreService');
  const counts: Record<string, number> = {};

  for (const collectionName of Object.values(STORES)) {
    try {
      const data = await getAllFromFirestore(collectionName);
      counts[collectionName] = data.length;
    } catch (error) {
      counts[collectionName] = 0;
    }
  }

  return counts;
}

/**
 * Compara dados do IndexedDB vs Firestore
 */
export async function compareData(): Promise<void> {
  console.log('\n🔍 Comparando IndexedDB vs Firestore...');
  console.log('='  .repeat(60));

  for (const collectionName of Object.values(STORES)) {
    try {
      const localData = await getAllFromLocal<any>(collectionName);
      const { getAllFromFirestore } = await import('../services/firestoreService');
      const firestoreData = await getAllFromFirestore<any>(collectionName);

      console.log(`\n📂 ${collectionName}:`);
      console.log(`   IndexedDB: ${localData.length} itens`);
      console.log(`   Firestore: ${firestoreData.length} itens`);

      if (localData.length === firestoreData.length) {
        console.log(`   ✅ Sincronizados`);
      } else {
        console.log(`   ⚠️ Diferença de ${Math.abs(localData.length - firestoreData.length)} itens`);
      }
    } catch (error: any) {
      console.error(`   ❌ Erro: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

/**
 * Limpa todos os dados do Firestore (use com CUIDADO!)
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

// Exportar função para uso no console do navegador
if (typeof window !== 'undefined') {
  (window as any).migrateToFirestore = migrateAllToFirestore;
  (window as any).compareData = compareData;
  (window as any).resetFirestore = resetFirestore;
  (window as any).checkFirestoreData = checkFirestoreData;

  console.log('🔧 Ferramentas de migração disponíveis no console:');
  console.log('   - window.migrateToFirestore()');
  console.log('   - window.compareData()');
  console.log('   - window.checkFirestoreData()');
  console.log('   - window.resetFirestore()');
}
