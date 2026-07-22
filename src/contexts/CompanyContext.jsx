import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './LocalAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { storage } from '@/lib/storage';

export const CompanyContext = createContext();

export const CompanyProvider = ({ children }) => {
  const { activeSessionId, isGeneralAdmin, isAuthenticated } = useAuth();
  const [activeCompany, setActiveCompany] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [isConsolidated, setIsConsolidated] = useState(false);
  const { toast } = useToast();

  const loadCompanies = async () => {
    try {
      const data = await storage.getItem('companies');
      const stored = JSON.parse(data || '[]');
      setCompanies(stored);
    } catch (e) {
      console.error("Error loading companies:", e);
    }
  };

  // Load companies
  useEffect(() => {
    loadCompanies();
    
    // Custom event listener since cross-tab IndexedDB sync isn't native like localStorage
    const handleStorageUpdate = (e) => {
       if (e.detail?.key === 'companies' || e.detail?.key === 'all-data-update') {
           loadCompanies();
       }
    };
    window.addEventListener('storage-updated', handleStorageUpdate);
    return () => window.removeEventListener('storage-updated', handleStorageUpdate);
  }, []);

  // Set active company based on session
  useEffect(() => {
    const initActiveCompany = async () => {
      if (isAuthenticated && activeSessionId && activeSessionId !== 'general_admin') {
          const current = companies.find(c => c.id === activeSessionId);
          setActiveCompany(current || null);
          
          if (current) {
             const consolidationData = await storage.getItem(`${current.id}-consolidate`);
             setIsConsolidated(consolidationData === 'true');
          }
      } else {
          setActiveCompany(null);
          setIsConsolidated(false);
      }
    };
    initActiveCompany();
  }, [activeSessionId, companies, isAuthenticated]); 

  const toggleConsolidation = async (value) => {
    if (!activeCompany) return;
    setIsConsolidated(value);
    await storage.setItem(`${activeCompany.id}-consolidate`, String(value));
  };
  
  const refreshCompanies = async () => {
     await loadCompanies();
  };

  const updateCompanyCredentials = async (companyId, newData) => {
    const updatedCompanies = companies.map(c => {
      if (c.id === companyId) {
        return { ...c, ...newData };
      }
      return c;
    });
    
    setCompanies(updatedCompanies);
    await storage.setItem('companies', JSON.stringify(updatedCompanies));
    window.dispatchEvent(new CustomEvent('storage-updated', { detail: { key: 'companies' } }));
    
    if (activeCompany && activeCompany.id === companyId) {
       setActiveCompany({ ...activeCompany, ...newData });
    }

    toast({ title: "Seguridad Actualizada", description: "Las credenciales han sido modificadas correctamente." });
  };

  const switchCompany = async (companyId) => {
    const target = companies.find(c => c.id === companyId);
    if (target) {
        await storage.setItem('auth_session', target.id);
        setActiveCompany(target);
        setIsConsolidated(false);
        await storage.setItem(`${target.id}-consolidate`, 'false');
        toast({ title: "Cambio de Empresa", description: `Has cambiado a: ${target.name}` });
        return true;
    }
    toast({ variant: "destructive", title: "Error", description: "No se encontró la empresa solicitada." });
    return false;
  };

  const value = {
    activeCompany,
    companies,
    setCompanies: refreshCompanies, // We can expose the async refresh directly
    isGeneralAdmin,
    accessLevel: useAuth().accessLevel,
    isConsolidated,
    toggleConsolidation,
    updateCompanyCredentials,
    switchCompany
  };

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = () => {
  const context = useContext(CompanyContext);
  if (!context) {
      throw new Error("useCompany must be used within a CompanyProvider");
  }
  return context;
};