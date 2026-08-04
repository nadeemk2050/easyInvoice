import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBlV54CD69ZZ8JD_AsNNeK5zReiW0jawMA",
  authDomain: "easyinvoicing-b6908.firebaseapp.com",
  projectId: "easyinvoicing-b6908",
  storageBucket: "easyinvoicing-b6908.firebasestorage.app",
  messagingSenderId: "986175890311",
  appId: "1:986175890311:web:3355670d2574d279ff6922",
  measurementId: "G-VWGPB8G3G8"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { onAuthStateChanged };
export default app;
