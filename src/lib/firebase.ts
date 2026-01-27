// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCMY55-c1C9fdWxBGfZnkB21JCbilBpD30",
  authDomain: "oficina-erp-8688d.firebaseapp.com",
  projectId: "oficina-erp-8688d",
  storageBucket: "oficina-erp-8688d.firebasestorage.app",
  messagingSenderId: "673317755556",
  appId: "1:673317755556:web:06b5d3459b4cd83553a431",
  measurementId: "G-13G8SG4Z2G",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
