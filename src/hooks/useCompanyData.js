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

    let loadedData = [];
    let fetchFromCloudSuccess = false;

    try {
        if (isConsolidated && companies.length > 0) {
            const relevantCompanies = companies.filter(c => c.id === activeCompany.id || c.parentId === activeCompany.id);
            const companyIds = relevantCompanies.map(c => String(c.id));

            const { data: dbData, error } = await supabase
                .from('app_data_sync')
                .select('company_id, data')
                .eq('storage_key', key)
                .in('company_id', companyIds);

            if (!error && dbData && dbData.length > 0) {
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

            if (!error && dbData && Array.isArray(dbData.data)) {
                loadedData = dbData.data;
                fetchFromCloudSuccess = true;
            }
        }
    } catch (cloudError) {
        console.warn("No se pudo conectar a la nube, buscando en local...");
    }

    if (!fetchFromCloudSuccess || loadedData.length === 0) {
        if (isConsolidated && companies.length > 0) {
            const relevantCompanies = companies.filter(c => c.id === activeCompany.id || c.parentId === activeCompany.id);
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
                    } catch (e) { console.error(e); }
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

  // ESCUCHA EN TIEMPO REAL CON PREVENCIÓN DE ERRORES (ANTIBALAS)
  useEffect(() => {
    let isActive = true; // Evita actualizar estados si cambias de pantalla rápido
    let channel;

    const safeLoad = async () => {
        try {
            await loadData();
        } catch (e) {
            console.error("Error silencioso cargando datos:", e);
        }
    };

    safeLoad();

    if (activeCompany) {
        try {
            // Verificamos que tu versión de Supabase soporte .channel()
            if (typeof supabase.channel === 'function') {
                channel = supabase
                    .channel(`sync-${activeCompany.id}-${key}`)
                    .on(
                        'postgres_changes',
                        { event: '*', schema: 'public', table: 'app_data_sync', filter: `company_id=eq.${activeCompany.id}` },
                        (payload) => {
                            if (payload.new && payload.new.storage_key === key && isActive) {
                                console.log(`📡 Datos recibidos en ${key}. Actualizando...`);
                                safeLoad();
                            }
                        }
                    )
                    .subscribe();
            }
        } catch (err) {
            console.warn("⚠️ Tiempo real no disponible momentáneamente:", err);
        }
    }

    const handleStorageUpdate = (e) => {
        if (e.detail?.key === `${activeCompany?.id}-${key}` ||
            e.detail?.key === 'all-data-update' ||
            (isConsolidated && e.detail?.key?.endsWith(`-${key}`))) {
            if (isActive) safeLoad();
        }
    };
    
    window.addEventListener('storage-updated', handleStorageUpdate);
    
    return () => {
        isActive = false;
        window.removeEventListener('storage-updated', handleStorageUpdate);
        
        if (channel && typeof supabase.removeChannel === 'function') {
            try {
                supabase.removeChannel(channel);
            } catch (e) {
                // Ignoramos errores al cerrar el canal
            }
        }
    };
  }, [loadData, activeCompany, key, isConsolidated]);

  const saveData = async (newData) => {
      if (!activeCompany) return;
      const storageKey = `${activeCompany.id}-${key}`;
      
      // 1. Guardado Local Inmediato
      await storage.setItem(storageKey, JSON.stringify(newData));
      window.dispatchEvent(new CustomEvent('storage-updated', { detail: { key: storageKey } }));
      
      if (!isConsolidated && mounted.current) {
          setData(newData);
      }

      // 2. FUSIÓN INTELIGENTE PROTEGIDA CONTRA CRASHES
      try {
          const { data: cloudRow, error: fetchError } = await supabase
              .from('app_data_sync')
              .select('data')
              .eq('company_id', String(activeCompany.id))
              .eq('storage_key', key)
              .maybeSingle();

          let finalDataToUpload = newData;

          if (!fetchError && cloudRow && Array.isArray(cloudRow.data)) {
              // Verificación súper estricta para evitar que un objeto simple dañe la fusión
              const isMergeable = Array.isArray(newData) && newData.length > 0 && newData[0] && newData[0].id;
              
              if (isMergeable) {
                  const mergeMap = new Map(cloudRow.data.map(item => [item.id, item]));
                  newData.forEach(item => mergeMap.set(item.id, item));
                  finalDataToUpload = Array.from(mergeMap.values());
              }
          }

          // 3. Subimos a la nube
          const { error } = await supabase
              .from('app_data_sync')
              .upsert({
                  company_id: String(activeCompany.id),
                  storage_key: key,
                  data: finalDataToUpload,
                  updated_at: new Date().toISOString()
              });

          if (error) console.error(`❌ Error sincronizando [${key}]:`, error);
          
      } catch (cloudError) {
          console.error("Error de red intentando guardar en Supabase:", cloudError);
      }
  };

  return [data, saveData, isLoaded];
}