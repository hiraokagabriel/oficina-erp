import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  deleteDoc
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { auth } from "../lib/firebase";

const clientsCol = collection(db, "clients");

export async function createClient(data: any) {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuário não autenticado");

  return addDoc(clientsCol, {
    ...data,
    userId: user.uid,
    createdAt: new Date()
  });
}

export async function listClients() {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuário não autenticado");

  const q = query(clientsCol, where("userId", "==", user.uid));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateClient(id: string, data: any) {
  const ref = doc(db, "clients", id);
  return updateDoc(ref, data);
}

export async function deleteClient(id: string) {
  const ref = doc(db, "clients", id);
  return deleteDoc(ref);
}
