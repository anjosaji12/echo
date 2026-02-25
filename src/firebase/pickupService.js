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
    updateDoc,
} from 'firebase/firestore';
import { db } from './config';

const PICKUPS_COL = 'pickups';

/**
 * Add a new pickup for a given user.
 * @param {string} uid
 * @param {{ wasteTypes, address, date, time, customerName }} pickupData
 * @returns {Promise<string>} The new document id
 */
export async function addPickup(uid, pickupData) {
    const docRef = await addDoc(collection(db, PICKUPS_COL), {
        uid,
        customerName: pickupData.customerName || 'Customer',
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
 * Subscribe to real-time pickup updates for one customer.
 * @param {string}   uid
 * @param {Function} callback
 * @returns {Function} unsubscribe
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
 * Subscribe to ALL pickups across all customers — used by the Partner portal.
 * Partners see every pickup so they can accept / manage orders.
 * @param {Function} callback
 * @returns {Function} unsubscribe
 */
export function subscribeToAllPickups(callback) {
    const q = query(
        collection(db, PICKUPS_COL),
        orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, snapshot => {
        const pickups = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(pickups);
    });
}

/**
 * Update the status of a pickup document.
 * Called by the Partner portal when accepting or completing an order.
 * @param {string} pickupId
 * @param {'pending'|'in-progress'|'completed'} status
 */
export function updatePickupStatus(pickupId, status) {
    return updateDoc(doc(db, PICKUPS_COL, pickupId), { status });
}

/**
 * Delete a pickup by document id.
 * @param {string} pickupId
 */
export function deletePickup(pickupId) {
    return deleteDoc(doc(db, PICKUPS_COL, pickupId));
}
