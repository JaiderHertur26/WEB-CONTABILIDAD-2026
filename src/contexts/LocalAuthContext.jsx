import React, { createContext, useContext, useState, useEffect } from 'react';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

const LocalAuthContext = createContext();

export const getCompanies = async () => {
  try {
    const { data, error } = await supabase.from('companies').select('*');
    if (error) {
        console.error("Error al consultar empresas:", error);
        return [];
    }
    return (data || []).map(comp => ({
        ...comp,
        doc: comp.doc_nit, 
        parentId: comp.parent_id
    }));
  } catch (e) {
    console.error("Error de red:", e);
    return [];
  }
};

// CORRECCIÓN AQUÍ: Ahora la función lanza el error hacia la interfaz
export const saveCompanies = async (companies) => {
  try {
    const cleanedCompanies = companies.map(c => ({
        id: String(c.id), // Forzamos a que sea texto
        parent_id: c.parentId ? String(c.parentId) : null,
        name: c.name,
        doc_nit: c.doc || c.doc_nit || null,
        address: c.address || null,
        phone: c.phone || null,
        username: c.username,
        password: c.password,
    }));

    const { error } = await supabase
        .from('companies')
        .upsert(cleanedCompanies, { onConflict: 'id' });

    // Si Supabase se queja, interrumpimos el proceso
    if (error) {
        console.error("Error Supabase:", error);
        throw new Error(error.message); 
    }
  } catch (e) {
    console.error("Error crítico guardando companies:", e);
    throw e; // Dispara el Toast rojo en Settings.js
  }
};

export const validateCompanyJSON = (jsonData) => {
  if (!jsonData || typeof jsonData !== 'object') return { isValid: false, error: 'Archivo vacío o formato inválido.' };
  if (!jsonData.version) return { isValid: false, error: 'Falta campo "version".' };
  if (jsonData.type !== 'ADMIN_STRUCTURE_ONLY') return { isValid: false, error: 'Se requiere "ADMIN_STRUCTURE_ONLY".' };
  if (!Array.isArray(jsonData.companies)) return { isValid: false, error: 'Estructura incorrecta.' };
  return { isValid: true, error: null };
};

export const mergeCompanies = (existingCompanies, restoredCompanies) => {
  const companyMap = new Map();
  existingCompanies.forEach(comp => { if (comp && comp.id) companyMap.set(comp.id, comp); });
  restoredCompanies.forEach(restoredComp => {
    if (companyMap.has(restoredComp.id)) {
      companyMap.set(restoredComp.id, { ...companyMap.get(restoredComp.id), ...restoredComp });
    } else {
      companyMap.set(restoredComp.id, restoredComp);
    }
  });
  return Array.from(companyMap.values());
};

export const LocalAuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGeneralAdmin, setIsGeneralAdmin] = useState(false);
  const [accessLevel, setAccessLevel] = useState('full');
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const session = await storage.getItem('auth_session');
        const level = await storage.getItem('auth_access_level') || 'full';
        
        if (session) {
          setIsAuthenticated(true);
          setActiveSessionId(session);
          setAccessLevel(level);
          setIsGeneralAdmin(session === 'general_admin');
        }
      } catch (error) {
        console.error("Auth init error:", error);
      } finally {
        setLoading(false);
      }
    };
    initAuth();
  }, []);

  const login = async (data) => {
    setIsAuthenticated(true);
    setAccessLevel(data.accessLevel || 'full');
    await storage.setItem('auth_access_level', data.accessLevel || 'full');

    if (data.isGeneralAdmin) {
      setIsGeneralAdmin(true);
      setActiveSessionId('general_admin');
      await storage.setItem('auth_session', 'general_admin');
    } else {
      setIsGeneralAdmin(false);
      setActiveSessionId(data.company.id);
      await storage.setItem('auth_session', data.company.id);
    }
  };

  const logout = async () => {
    setIsAuthenticated(false);
    setIsGeneralAdmin(false);
    setActiveSessionId(null);
    setAccessLevel('full');
    await storage.removeItem('auth_session');
    await storage.removeItem('auth_access_level');
  };

  return (
    <LocalAuthContext.Provider value={{ 
      isAuthenticated, isGeneralAdmin, accessLevel, activeSessionId, login, logout, loading 
    }}>
      {children}
    </LocalAuthContext.Provider>
  );
};

export const useAuth = () => useContext(LocalAuthContext);