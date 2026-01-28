/**
 * firebase.ts
 * Configuração do Firebase para Firestore e Auth
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Configuração do Firebase
// IMPORTANTE: Substitua com suas credenciais do Firebase Console
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "YOUR_AUTH_DOMAIN",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "YOUR_STORAGE_BUCKET",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "YOUR_APP_ID"
};

// ⚠️ PREVINE INICIALIZAÇÃO DUPLICADA (Fix para HMR do Vite)
let app;
if (!getApps().length) {
  // Primeira inicialização
  app = initializeApp(firebaseConfig);
  console.log('✅ Firebase inicializado');
} else {
  // App já existe, reutiliza
  app = getApp();
  console.log('🔄 Firebase reutilizado (HMR)');
}

// Inicializa o Firestore
const db = getFirestore(app);

// Inicializa o Auth
const auth = getAuth(app);

// Habilita persistência offline (cache local) - apenas uma vez
if (!getApps().some(a => a.name === '[DEFAULT]' && (a as any)._persistenceEnabled)) {
  try {
    enableIndexedDbPersistence(db).then(() => {
      console.log('💾 Cache offline habilitado');
      (app as any)._persistenceEnabled = true;
    }).catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('⚠️ Múltiplas abas abertas. Persistência desabilitada.');
      } else if (err.code === 'unimplemented') {
        console.warn('⚠️ Navegador não suporta persistência offline.');
      } else {
        console.warn('⚠️ Persistência já habilitada ou erro:', err.code);
      }
    });
  } catch (error: any) {
    console.warn('⚠️ Erro ao habilitar persistência:', error.message);
  }
}

export { app, db, auth };
