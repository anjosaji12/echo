// src/firebase/config.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyB2aSz4rvIOqa5qpSY7U-u0OEimKqpU1ps",
    authDomain: "echo-d88e0.firebaseapp.com",
    projectId: "echo-d88e0",
    storageBucket: "echo-d88e0.firebasestorage.app",
    messagingSenderId: "574632653947",
    appId: "1:574632653947:web:47322dd8a9829b7c41dede",
    measurementId: "G-8L559CS4BK",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
