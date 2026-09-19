import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './LocalAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { storage } from '@/lib/storage';
import { sessionCompanies, updateCompanySecure } from '@/lib/secureApi';

export const CompanyContext = createContext();

export const CompanyProvider = ({ children }) => {
  const { activeSessionId, isGeneralAdmin, isAuthenticated, accessLevel, sessionToken } = useAuth();
  const [activeCompany, setActiveCompany] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [isConsolidated, setIsConsolidated] = useState(false);
  const { toast } = useToast();

  const loadCompanies = async () => {
    if (!isAuthenticated || !sessionToken) {
      setCompanies([]);
      return;
    }
    try {
      const data = await sessionCompanies(sessionToken);
      const mappedCompanies = (data || []).map(comp => ({
        ...comp,
        id: String(comp.id),
        doc: comp.doc_nit,
        parentId: comp.parent_id ? String(comp.parent_id) : null,
        isActive: !!comp.is_active,
      }));
      setCompanies(mappedCompanies);
    } catch (e) {
      console.error("Error cargando empresas autorizadas:", e);
      setCompanies([]);
    }
  };

  // Cargar empresas al iniciar
  useEffect(() => {
    loadCompanies();
    
    // Escucha eventos locales por si alguna otra pestaña actualiza algo urgente
    const handleStorageUpdate = (e) => {
       if (e.detail?.key === 'companies' || e.detail?.key === 'all-data-update') {
           loadCompanies();
       }
    };
    window.addEventListener('storage-updated', handleStorageUpdate);
    return () => window.removeEventListener('storage-updated', handleStorageUpdate);
  }, [isAuthenticated, sessionToken]);

  // Establecer la empresa activa basándose en la sesión (Guardado en Local)
  useEffect(() => {
    const initActiveCompany = async () => {
      if (isAuthenticated && activeSessionId && activeSessionId !== 'general_admin') {
          const current = companies.find(c => c.id === activeSessionId);
          setActiveCompany(current || null);
          
          if (current) {
             // La vista consolidada es una preferencia visual del navegador, se queda en storage
             const consolidationData = await storage.getItem(`${current.id}-consolidate`);
             setIsConsolidated(consolidationData === 'true');
          }
      } else {
          setActiveCompany(null);
          setIsConsolidated(false);
      }
    };
    // Solo iniciamos esto cuando companies ya se cargó de la nube
    if (companies.length > 0 || !isAuthenticated) {
        initActiveCompany();
    }
  }, [activeSessionId, companies, isAuthenticated]); 

  // Preferencia visual local
  const toggleConsolidation = async (value) => {
    if (!activeCompany) return;
    setIsConsolidated(value);
    await storage.setItem(`${activeCompany.id}-consolidate`, String(value));
  };
  
  const refreshCompanies = async () => {
     await loadCompanies();
  };

  // ACTUALIZADO: Traductor completo de variables a nombres de columna SQL
  const updateCompanyCredentials = async (companyId, newData) => {
    try {
      if (!sessionToken) throw new Error('Sesión segura no disponible');
      const updatePayload = { ...newData };
      if (newData.doc !== undefined) {
        updatePayload.doc_nit = newData.doc;
        delete updatePayload.doc;
      }
      if (newData.parentId !== undefined) {
        updatePayload.parent_id = newData.parentId;
        delete updatePayload.parentId;
      }
      if (newData.partialPassword !== undefined) {
        updatePayload.partial_password = newData.partialPassword;
        delete updatePayload.partialPassword;
      }

      await updateCompanySecure(sessionToken, companyId, updatePayload);
      await loadCompanies();

      if (activeCompany && activeCompany.id === companyId) {
        setActiveCompany(prev => ({ ...prev, ...newData }));
      }

      toast({ title: "Seguridad Actualizada", description: "Los datos se actualizaron mediante sesión protegida." });
      return true;
    } catch (e) {
      console.error("Error actualizando credenciales:", e);
      toast({ variant: "destructive", title: "Error", description: "No se pudieron actualizar las credenciales." });
      return false;
    }
  };

  // Cambiar de empresa es un evento de sesión (Local)
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
    setCompanies: refreshCompanies, 
    isGeneralAdmin,
    accessLevel,
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