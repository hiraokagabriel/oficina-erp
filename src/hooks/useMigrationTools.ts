/**
 * useMigrationTools.ts
 * Hook para disponibilizar ferramentas de migração no console do navegador
 */

import { useEffect } from 'react';

export function useMigrationTools() {
  useEffect(() => {
    // Disponibilizar informações sobre migração
    if (typeof window !== 'undefined') {
      console.log('%c🔥 FIREBASE FIRESTORE DISPONÍVEL', 'color: #FF6B35; font-weight: bold; font-size: 16px');
      console.log('%c✅ Serviços criados:', 'color: #4ECDC4; font-weight: bold');
      console.log('  • src/config/firebase.ts');
      console.log('  • src/services/firestoreService.ts');
      console.log('');
      console.log('%c📚 Documentação:', 'color: #FFE66D; font-weight: bold');
      console.log('  • docs/FIREBASE_MIGRATION.md');
      console.log('  • .env.example (template de configuração)');
      console.log('');
      console.log('%c🚀 Próximos Passos:', 'color: #95E1D3; font-weight: bold');
      console.log('  1. npm install firebase');
      console.log('  2. Configure .env com credenciais do Firebase');
      console.log('  3. Atualize imports para usar firestoreService');
      console.log('');
      console.log('%c💬 Exemplo de uso:', 'color: #A8E6CF; font-weight: bold');
      console.log('  import * as db from "./services/firestoreService";');
      console.log('  await db.getAllFromFirestore("processos");');
      console.log('');
    }
  }, []);
}
