import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB4D5SF3is411Wirbf67tLFVEc3AQmUINo",
  authDomain: "azfc-a460e.firebaseapp.com",
  projectId: "azfc-a460e",
  storageBucket: "azfc-a460e.firebasestorage.app",
  messagingSenderId: "827240308945",
  appId: "1:827240308945:web:de2d82cfc53f7626c0e5f0"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
