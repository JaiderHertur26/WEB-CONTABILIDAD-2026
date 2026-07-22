import { useState, useEffect, useCallback, useRef } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { storage } from '@/lib/storage';

export function useCompanyData(key) {
  const { activeCompany, companies, isConsolidated } = useCompany();
  const [data, setData] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const loadData = useCallback(async () => {
    if (!activeCompany) {
        if (mounted.current) {
            setData([]);
            setIsLoaded(true);
        }
        return;
    }

    let loadedData = [];

    // Check consolidation from CONTEXT
    if (isConsolidated && companies.length > 0) {
        const relevantCompanies = companies.filter(c => 
            c.id === activeCompany.id || c.parentId === activeCompany.id
        );
        const uniqueCompanies = Array.from(new Map(relevantCompanies.map(c => [c.id, c])).values());

        for (const comp of uniqueCompanies) {
            const storageKey = `${comp.id}-${key}`;
            const stored = await storage.getItem(storageKey);
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed)) {
                        const tagged = parsed.map(item => ({ 
                            ...item, 
                            _companyId: comp.id, 
                            _companyName: comp.name,
                            _isConsolidated: comp.id !== activeCompany.id
                        }));
                        loadedData = [...loadedData, ...tagged];
                    }
                } catch (e) { console.error(e); }
            }
        }
    } else {
        // Standard Single Company Load
        const storageKey = `${activeCompany.id}-${key}`;
        const stored = await storage.getItem(storageKey);
        if (stored) {
            try {
                loadedData = JSON.parse(stored);
            } catch (e) { loadedData = []; }
        } else {
            loadedData = [];
        }
    }

    if (mounted.current) {
        if (Array.isArray(loadedData) && loadedData.length > 0) {
             const allHaveIds = loadedData.every(item => item && (item.id !== undefined && item.id !== null));
             if (allHaveIds) {
                 const uniqueData = Array.from(new Map(loadedData.map(item => [item.id, item])).values());
                 setData(uniqueData);
             } else {
                 setData(loadedData);
             }
        } else {
             setData(loadedData || []);
        }
        setIsLoaded(true);
    }
  }, [activeCompany, companies, key, isConsolidated]);

  useEffect(() => {
    loadData();
    const handleStorageUpdate = (e) => {
        if (e.detail?.key === `${activeCompany?.id}-${key}` ||
            e.detail?.key === 'all-data-update' ||
            (isConsolidated && e.detail?.key?.endsWith(`-${key}`))) {
            loadData();
        }
    };
    window.addEventListener('storage-updated', handleStorageUpdate);
    return () => window.removeEventListener('storage-updated', handleStorageUpdate);
  }, [loadData, activeCompany, key, isConsolidated]);

  const saveData = async (newData) => {
      if (!activeCompany) return;
      const storageKey = `${activeCompany.id}-${key}`;
      await storage.setItem(storageKey, JSON.stringify(newData));
      window.dispatchEvent(new CustomEvent('storage-updated', { detail: { key: storageKey } }));
      
      if (!isConsolidated && mounted.current) {
          setData(newData);
      } else {
          await loadData();
      }
  };

  return [data, saveData, isLoaded];
}