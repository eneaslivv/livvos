
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// ------------------------------------------------------------------
// CONFIGURACIÓN: Reemplaza esto con tus credenciales de Firebase Console
// ------------------------------------------------------------------
const firebaseConfig = {
  apiKey: process.env.REACT_APP_API_KEY || "TU_API_KEY",
  authDomain: process.env.REACT_APP_AUTH_DOMAIN || "tu-proyecto.firebaseapp.com",
  projectId: process.env.REACT_APP_PROJECT_ID || "tu-proyecto",
  storageBucket: process.env.REACT_APP_STORAGE_BUCKET || "tu-proyecto.appspot.com",
  messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.REACT_APP_APP_ID || "1:123456789:web:abcdef"
};

// Inicializar Firebase solo si no existe ya una instancia
const app = initializeApp(firebaseConfig);

// Exportar servicios
export const db = getFirestore(app);
export const auth = getAuth(app);
