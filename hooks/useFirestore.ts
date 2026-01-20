
import { useState, useEffect } from 'react';
import { 
    collection, 
    onSnapshot, 
    query, 
    orderBy, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc,
    DocumentData 
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export const useFirestore = <T extends DocumentData>(collectionName: string) => {
    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Lectura en Tiempo Real
    useEffect(() => {
        try {
            const q = query(collection(db, collectionName));
            
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const results: T[] = [];
                snapshot.forEach((doc) => {
                    results.push({ id: doc.id, ...doc.data() } as T);
                });
                setData(results);
                setLoading(false);
            }, (err) => {
                console.error("Error fetching collection:", err);
                setError(err.message);
                setLoading(false);
            });

            return () => unsubscribe();
        } catch (err: any) {
            console.error("Firebase init error:", err);
            setError("Firebase not configured or invalid credentials");
            setLoading(false);
        }
    }, [collectionName]);

    // Acciones CRUD
    const add = async (item: any) => {
        try {
            await addDoc(collection(db, collectionName), item);
        } catch (e) {
            console.error("Error adding doc:", e);
        }
    };

    const update = async (id: string, updates: any) => {
        try {
            await updateDoc(doc(db, collectionName, id), updates);
        } catch (e) {
            console.error("Error updating doc:", e);
        }
    };

    const remove = async (id: string) => {
        try {
            await deleteDoc(doc(db, collectionName, id));
        } catch (e) {
            console.error("Error deleting doc:", e);
        }
    };

    return { data, loading, error, add, update, remove };
};
