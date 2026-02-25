// src/firebase/pickupService.js
// CRUD helpers for the `pickups` Firestore collection.

import {
    collection,
    addDoc,
    getDocs,
    deleteDoc,
    doc,
    query,
    where,
    orderBy,
    serverTimestamp,
    onSnapshot,
} from 'firebase/firestore';
import { db } from './config';

const PICKUPS_COL = 'pickups';

/**
 * Add a new pickup for a given user.
 *
 * @param {string} uid          Firebase user id
 * @param {{ wasteTypes, address, date, time }} pickupData
 * @returns {Promise<string>}   The new document id
 */
export async function addPickup(uid, pickupData) {
    const docRef = await addDoc(collection(db, PICKUPS_COL), {
        uid,
        wasteTypes: pickupData.wasteTypes,
        address: pickupData.address,
        date: pickupData.date,
        time: pickupData.time,
        status: 'pending',
        createdAt: serverTimestamp(),
    });
    return docRef.id;
}

/**
 * Fetch all pickups for a user (one-time read).
 *
 * @param {string} uid
 * @returns {Promise<Array>}
 */
export async function getPickups(uid) {
    const q = query(
        collection(db, PICKUPS_COL),
        where('uid', '==', uid),
        orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Subscribe to real-time pickup updates for a user.
 * Returns an unsubscribe function.
 *
 * @param {string}   uid
 * @param {Function} callback   Called with the latest array of pickup objects.
 * @returns {Function}          Unsubscribe function
 */
export function subscribeToPickups(uid, callback) {
    const q = query(
        collection(db, PICKUPS_COL),
        where('uid', '==', uid),
        orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, snapshot => {
        const pickups = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(pickups);
    });
}

/**
 * Delete a pickup by document id.
 *
 * @param {string} pickupId
 */
export function deletePickup(pickupId) {
    return deleteDoc(doc(db, PICKUPS_COL, pickupId));
}
