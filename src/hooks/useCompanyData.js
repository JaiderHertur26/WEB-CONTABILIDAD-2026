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

    // 1. DESCARGAR DE LA NUBE
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

    // 2. MODO LOCAL (Respaldo si no hay internet o si la nube está vacía)
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
        // Actualizamos caché local con lo que bajó de la nube
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
      
      // Guardado Local
      await storage.setItem(storageKey, JSON.stringify(newData));
      window.dispatchEvent(new CustomEvent('storage-updated', { detail: { key: storageKey } }));
      
      if (!isConsolidated && mounted.current) {
          setData(newData);
      } else {
          await loadData();
      }

      // GUARDADO EN LA NUBE CORREGIDO
      try {
          const { error } = await supabase
              .from('app_data_sync')
              .upsert({
                  company_id: String(activeCompany.id),
                  storage_key: key,
                  data: newData,
                  updated_at: new Date().toISOString()
              }); // Supabase detecta automáticamente la llave primaria

          if (error) {
              console.error(`❌ Error sincronizando [${key}] a la nube:`, error);
          } else {
              console.log(`☁️✅ Sincronización exitosa a Supabase: Módulo -> ${key}`);
          }
      } catch (cloudError) {
          console.error("Error de red intentando guardar en Supabase:", cloudError);
      }
  };

  return [data, saveData, isLoaded];
}