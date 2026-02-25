// src/firebase/partnerService.js
// Firestore helpers for agency (partner) profiles and their pickup tasks.

import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

/**
 * Save or overwrite an agency profile in Firestore.
 * @param {string} uid  Firebase user UID
 * @param {object} data Agency registration data
 */
export async function saveAgencyProfile(uid, data) {
    await setDoc(doc(db, 'agencies', uid), {
        ...data,
        updatedAt: serverTimestamp(),
    }, { merge: true });
}

/**
 * Load an agency profile from Firestore.
 * @param {string} uid
 * @returns {object|null}
 */
export async function getAgencyProfile(uid) {
    const snap = await getDoc(doc(db, 'agencies', uid));
    return snap.exists() ? snap.data() : null;
}
