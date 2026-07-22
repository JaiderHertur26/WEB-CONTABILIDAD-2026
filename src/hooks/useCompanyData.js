import { useState, useEffect, useCallback, useRef } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

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

    try {
        let loadedData = [];
        let fetchFromCloudSuccess = false;

        // 1. INTENTO DE DESCARGA EN LA NUBE (BLINDADO)
        try {
            if (isConsolidated && companies && companies.length > 0) {
                const relevantCompanies = companies.filter(c => c && (c.id === activeCompany.id || c.parentId === activeCompany.id));
                const companyIds = relevantCompanies.map(c => String(c.id));

                const { data: dbData, error } = await supabase
                    .from('app_data_sync')
                    .select('company_id, data')
                    .eq('storage_key', key)
                    .in('company_id', companyIds);

                if (!error && dbData && Array.isArray(dbData)) {
                    dbData.forEach(row => {
                        const comp = relevantCompanies.find(c => String(c.id) === String(row.company_id));
                        if (comp && Array.isArray(row.data)) {
                            const tagged = row.data.map(item => ({ 
                                ...item, 
                                _companyId: comp.id, 
                                _companyName: comp.name,
                                _isConsolidated: comp.id !== activeCompany.id
                            }));
                            loadedData = [...loadedData, ...tagged];
                        }
                    });
                    fetchFromCloudSuccess = true;
                }
            } else {
                const { data: dbData, error } = await supabase
                    .from('app_data_sync')
                    .select('data')
                    .eq('company_id', String(activeCompany.id))
                    .eq('storage_key', key)
                    .maybeSingle();

                if (!error && dbData && dbData.data !== undefined) {
                    loadedData = dbData.data;
                    fetchFromCloudSuccess = true;
                }
            }
        } catch (cloudError) {
            console.warn("Nube no disponible, buscando local...");
        }

        // 2. RESPALDO LOCAL SI LA NUBE FALLA O ESTÁ VACÍA
        const isEmpty = Array.isArray(loadedData) ? loadedData.length === 0 : !loadedData;
        
        if (!fetchFromCloudSuccess || isEmpty) {
            if (isConsolidated && companies && companies.length > 0) {
                const relevantCompanies = companies.filter(c => c && (c.id === activeCompany.id || c.parentId === activeCompany.id));
                const uniqueCompanies = Array.from(new Map(relevantCompanies.map(c => [c.id, c])).values());

                for (const comp of uniqueCompanies) {
                    const stored = await storage.getItem(`${comp.id}-${key}`);
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
                        } catch (e) {}
                    }
                }
            } else {
                const stored = await storage.getItem(`${activeCompany.id}-${key}`);
                if (stored) {
                    try { loadedData = JSON.parse(stored); } catch (e) { loadedData = []; }
                } else {
                    loadedData = [];
                }
            }
        } else if (!isConsolidated) {
            await storage.setItem(`${activeCompany.id}-${key}`, JSON.stringify(loadedData));
        }

        // 3. ACTUALIZACIÓN VISUAL SEGURA
        if (mounted.current) {
            if (Array.isArray(loadedData)) {
                 const allHaveIds = loadedData.every(item => item && (item.id !== undefined && item.id !== null));
                 if (loadedData.length > 0 && allHaveIds) {
                     const uniqueData = Array.from(new Map(loadedData.map(item => [item.id, item])).values());
                     setData(uniqueData);
                 } else {
                     setData(loadedData);
                 }
            } else {
                 setData(loadedData || {});
            }
            setIsLoaded(true);
        }
    } catch (fatalError) {
        console.error("Error protegido en loadData:", fatalError);
        if (mounted.current) setIsLoaded(true);
    }
  }, [activeCompany, companies, key, isConsolidated]);

  // ESCUCHA EN TIEMPO REAL CON MANEJO DE ERRORES SILENCIOSO
  useEffect(() => {
    let isActive = true;
    let channel = null;

    const safeLoad = async () => {
        try {
            if (isActive) await loadData();
        } catch (e) {
            console.error("Error atrapado en safeLoad:", e);
        }
    };

    safeLoad();

    try {
        if (activeCompany && typeof supabase.channel === 'function') {
            channel = supabase
                .channel(`sync-${activeCompany.id}-${key}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'app_data_sync', filter: `company_id=eq.${activeCompany.id}` },
                    (payload) => {
                        if (payload.new && payload.new.storage_key === key && isActive) {
                            safeLoad();
                        }
                    }
                )
                .subscribe();
        }
    } catch (realtimeError) {
        console.warn("⚠️ Tiempo real falló, funcionando en modo normal.");
    }

    const handleStorageUpdate = (e) => {
        if (e.detail?.key === `${activeCompany?.id}-${key}` || e.detail?.key === 'all-data-update') {
            safeLoad();
        }
    };
    
    window.addEventListener('storage-updated', handleStorageUpdate);
    
    return () => {
        isActive = false;
        window.removeEventListener('storage-updated', handleStorageUpdate);
        try {
            if (channel && typeof supabase.removeChannel === 'function') {
                supabase.removeChannel(channel);
            }
        } catch (e) {}
    };
  }, [loadData, activeCompany, key, isConsolidated]);

  const saveData = async (newData) => {
      if (!activeCompany) return;
      const storageKey = `${activeCompany.id}-${key}`;
      
      try {
          // 1. CAMBIO VISUAL INMEDIATO
          if (!isConsolidated && mounted.current) {
              setData(newData);
          }
          await storage.setItem(storageKey, JSON.stringify(newData));

          // 2. FUSIÓN INTELIGENTE (SMART MERGE)
          const { data: cloudRow, error: fetchError } = await supabase
              .from('app_data_sync')
              .select('data')
              .eq('company_id', String(activeCompany.id))
              .eq('storage_key', key)
              .maybeSingle();

          let finalDataToUpload = newData;

          if (!fetchError && cloudRow && Array.isArray(cloudRow.data)) {
              const isMergeable = Array.isArray(newData) && newData.length > 0 && newData[0] && newData[0].id;
              
              if (isMergeable) {
                  const mergeMap = new Map(cloudRow.data.map(item => [item.id, item]));
                  newData.forEach(item => mergeMap.set(item.id, item));
                  finalDataToUpload = Array.from(mergeMap.values());
              }
          }

          // 3. SUBIMOS A LA NUBE
          const { error } = await supabase
              .from('app_data_sync')
              .upsert({
                  company_id: String(activeCompany.id),
                  storage_key: key,
                  data: finalDataToUpload,
                  updated_at: new Date().toISOString()
              });

          if (!error) {
              await storage.setItem(storageKey, JSON.stringify(finalDataToUpload));
              if (!isConsolidated && mounted.current) setData(finalDataToUpload);
              window.dispatchEvent(new CustomEvent('storage-updated', { detail: { key: storageKey } }));
          }
          
      } catch (cloudError) {
          console.error("Error crítico guardando en Supabase:", cloudError);
      }
  };

  return [data, saveData, isLoaded];
}