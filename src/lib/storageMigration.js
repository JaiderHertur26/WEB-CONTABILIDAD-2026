import { storage } from './storage';

export async function migrateFromLocalStorage() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return; // No environment to migrate from
    }

    try {
        const migrationFlag = await storage.getItem('_migration_done');
        if (migrationFlag === 'true') {
            return; // Already migrated
        }

        const keysToMigrate = Object.keys(window.localStorage);
        
        if (keysToMigrate.length === 0) {
            // Nothing to migrate, just mark as done
            await storage.setItem('_migration_done', 'true');
            return;
        }

        console.log(`[Storage Migration] Found ${keysToMigrate.length} items in localStorage. Starting migration to IndexedDB...`);

        // 1. Copy all items to localForage
        for (const key of keysToMigrate) {
            const value = window.localStorage.getItem(key);
            if (value !== null) {
                await storage.setItem(key, value);
            }
        }

        // 2. Validate successful migration
        let isSuccess = true;
        for (const key of keysToMigrate) {
            const migratedValue = await storage.getItem(key);
            const originalValue = window.localStorage.getItem(key);
            
            if (migratedValue !== originalValue) {
                console.error(`[Storage Migration] Validation failed for key: ${key}`);
                isSuccess = false;
                break;
            }
        }

        // 3. Clear localStorage if successful
        if (isSuccess) {
            console.log('[Storage Migration] Validation successful. Clearing localStorage...');
            for (const key of keysToMigrate) {
                window.localStorage.removeItem(key);
            }
            await storage.setItem('_migration_done', 'true');
            console.log('[Storage Migration] Complete.');
        } else {
            console.warn('[Storage Migration] Migration validation failed. LocalStorage data preserved.');
        }

    } catch (error) {
        console.error('[Storage Migration] Critical error during migration:', error);
    }
}