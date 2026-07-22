import localforage from './storageConfig';

export const storage = {
    async getItem(key) {
        try {
            const value = await localforage.getItem(key);
            // Fallback to localStorage if not found in localforage but exists in localStorage
            if (value === null && typeof window !== 'undefined' && window.localStorage) {
                const lsValue = window.localStorage.getItem(key);
                if (lsValue !== null) {
                    return lsValue;
                }
            }
            return value;
        } catch (error) {
            console.warn(`[Storage] Error reading key "${key}" from localForage, falling back to localStorage.`, error);
            if (typeof window !== 'undefined' && window.localStorage) {
                return window.localStorage.getItem(key);
            }
            return null;
        }
    },

    async setItem(key, value) {
        try {
            await localforage.setItem(key, value);
        } catch (error) {
            console.warn(`[Storage] Error setting key "${key}" in localForage, falling back to localStorage.`, error);
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem(key, value);
            }
        }
    },

    async removeItem(key) {
        try {
            await localforage.removeItem(key);
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.removeItem(key); // Also clear fallback just in case
            }
        } catch (error) {
            console.warn(`[Storage] Error removing key "${key}" in localForage, falling back to localStorage.`, error);
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.removeItem(key);
            }
        }
    },

    async clear() {
        try {
            await localforage.clear();
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.clear();
            }
        } catch (error) {
            console.warn('[Storage] Error clearing localForage, falling back to localStorage.', error);
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.clear();
            }
        }
    },

    async getAllKeys() {
        try {
            return await localforage.keys();
        } catch (error) {
            console.warn('[Storage] Error getting keys from localForage, falling back to localStorage.', error);
            if (typeof window !== 'undefined' && window.localStorage) {
                return Object.keys(window.localStorage);
            }
            return [];
        }
    }
};