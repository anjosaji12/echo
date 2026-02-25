// src/firebase/authService.js
// Thin wrappers around Firebase Auth + writes user profile to Firestore on signup.

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './config';

/**
 * Register a new user with email/password.
 * Saves an extra profile document to the `users` Firestore collection.
 *
 * @param {string} email
 * @param {string} password
 * @param {{ name, phone, area, flatNo, street }} profileData
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function registerUser(email, password, profileData) {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = credential.user.uid;

    // Set the Firebase Auth display name
    await updateProfile(credential.user, { displayName: profileData.name });

    const fullAddress = profileData.flatNo
        ? `${profileData.flatNo}, ${profileData.street || profileData.area}`
        : profileData.street || profileData.area || '';

    // Persist profile in Firestore
    await setDoc(doc(db, 'users', uid), {
        uid,
        name: profileData.name,
        email,
        phone: profileData.phone || '',
        area: profileData.area || '',
        flatNo: profileData.flatNo || '',
        street: profileData.street || '',
        fullAddress,
        createdAt: serverTimestamp(),
    });

    return { credential, fullAddress };
}

/**
 * Sign in with email / password.
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export function loginUser(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Sign the current user out.
 */
export function logoutUser() {
    return signOut(auth);
}
