/**
 * useMigrationTools.ts
 * Hook para disponibilizar ferramentas de migração no console do navegador
 */

import { useEffect } from 'react';
import { migrateAllToFirestore, compareData, resetFirestore, checkFirestoreData } from '../utils/migrateToFirestore';

export function useMigrationTools() {
  useEffect(() => {
    // Disponibilizar funções no window global
    if (typeof window !== 'undefined') {
      (window as any).migrateToFirestore = migrateAllToFirestore;
      (window as any).compareData = compareData;
      (window as any).resetFirestore = resetFirestore;
      (window as any).checkFirestoreData = checkFirestoreData;

      console.log('%c🔧 FERRAMENTAS DE MIGRAÇÃO DISPONÍVEIS', 'color: #8B5CF6; font-weight: bold; font-size: 14px');
      console.log('%c• window.migrateToFirestore()%c - Migra todos os dados do IndexedDB para Firestore', 'color: #10B981; font-weight: bold', 'color: #6B7280');
      console.log('%c• window.compareData()%c - Compara dados entre IndexedDB e Firestore', 'color: #10B981; font-weight: bold', 'color: #6B7280');
      console.log('%c• window.checkFirestoreData()%c - Verifica quantidade de dados no Firestore', 'color: #10B981; font-weight: bold', 'color: #6B7280');
      console.log('%c• window.resetFirestore()%c - PERIGO: Limpa TODOS os dados do Firestore', 'color: #EF4444; font-weight: bold', 'color: #6B7280');
      console.log('');
    }
  }, []);
}
