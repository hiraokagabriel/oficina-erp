import { auth } from "../lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider,
  User
} from "firebase/auth";

// Provider do Google
const googleProvider = new GoogleAuthProvider();

// Configurações opcionais do Google Provider
googleProvider.setCustomParameters({
  prompt: 'select_account' // Força seleção de conta toda vez
});

/**
 * Login com Email e Senha
 */
export function login(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Registro de novo usuário com Email e Senha
 */
export function signup(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password);
}

/**
 * Login com Google (OAuth)
 * Abre popup para seleção de conta Google
 */
export function loginWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

/**
 * Logout
 */
export function logout() {
  return signOut(auth);
}

/**
 * Enviar email de recuperação de senha
 */
export function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email);
}

/**
 * Listener de mudanças no estado de autenticação
 */
export function listenAuthChanges(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
