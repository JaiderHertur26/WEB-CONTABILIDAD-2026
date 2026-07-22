import React, { createContext, useContext, useState, useEffect } from 'react';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase'; // <-- Importamos nuestra nueva conexión a la nube

const LocalAuthContext = createContext();

// --- Helper Functions for Company Management & Restoration ---

export const getCompanies = async () => {
  try {
    // NUEVO: Consultamos directamente a la base de datos en la nube (Supabase)
    const { data, error } = await supabase
        .from('companies')
        .select('*');

    if (error) {
        console.error("Error al consultar empresas en Supabase:", error);
        return [];
    }

    // Mapeamos los datos de la nube para que React los entienda como antes
    return (data || []).map(comp => ({
        ...comp,
        doc: comp.doc_nit, // Transformamos doc_nit (BD) a doc (React)
        parentId: comp.parent_id
    }));
  } catch (e) {
    console.error("Error de red al obtener companies:", e);
    return [];
  }
};

export const saveCompanies = async (companies) => {
  try {
    // Filtramos y adaptamos el objeto para que coincida exactamente con las columnas de PostgreSQL
    const cleanedCompanies = companies.map(c => ({
        id: c.id,
        parent_id: c.parentId || null,
        name: c.name,
        doc_nit: c.doc || c.doc_nit || null,
        address: c.address || null,
        phone: c.phone || null,
        username: c.username,
        password: c.password,
        // Ignoramos campos obsoletos como partialPassword o authSerial si ya no se usan en BD
    }));

    // NUEVO: Upsert inserta si no existe, o actualiza si el ID ya existe en la nube
    const { error } = await supabase
        .from('companies')
        .upsert(cleanedCompanies, { onConflict: 'id' });

    if (error) {
        console.error("Error al guardar empresas en Supabase:", error.message);
    }
  } catch (e) {
    console.error("Error de red al guardar companies:", e);
  }
};

export const validateCompanyJSON = (jsonData) => {
  if (!jsonData || typeof jsonData !== 'object') {
    return { isValid: false, error: 'Archivo vacío o formato inválido.' };
  }
  
  if (!jsonData.version) {
    return { isValid: false, error: 'El archivo JSON no contiene el campo "version".' };
  }

  if (jsonData.type !== 'ADMIN_STRUCTURE_ONLY') {
    return { isValid: false, error: 'El tipo de archivo no es compatible. Se requiere "ADMIN_STRUCTURE_ONLY".' };
  }

  if (!Array.isArray(jsonData.companies)) {
    return { isValid: false, error: 'La estructura "companies" debe ser un arreglo.' };
  }

  for (const company of jsonData.companies) {
    const requiredFields = ['id', 'name', 'username', 'password'];
    const missing = requiredFields.filter(field => !company[field]);
    
    if (missing.length > 0) {
      return { 
        isValid: false, 
        error: `La empresa "${company.name || 'Desconocida'}" está incompleta. Faltan los campos: ${missing.join(', ')}` 
      };
    }
  }

  return { isValid: true, error: null };
};

export const mergeCompanies = (existingCompanies, restoredCompanies) => {
  const companyMap = new Map();
  
  existingCompanies.forEach(comp => {
    if (comp && comp.id) {
      companyMap.set(comp.id, comp);
    }
  });

  restoredCompanies.forEach(restoredComp => {
    if (companyMap.has(restoredComp.id)) {
      const existing = companyMap.get(restoredComp.id);
      companyMap.set(restoredComp.id, { ...existing, ...restoredComp });
    } else {
      companyMap.set(restoredComp.id, restoredComp);
    }
  });

  return Array.from(companyMap.values());
};

// --- Context Provider ---

export const LocalAuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGeneralAdmin, setIsGeneralAdmin] = useState(false);
  const [accessLevel, setAccessLevel] = useState('full');
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        // La sesión actual se mantiene en local para evitar cierres de sesión al recargar
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
    // data: { isGeneralAdmin, company, accessLevel }
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
      isAuthenticated, 
      isGeneralAdmin, 
      accessLevel, 
      activeSessionId, 
      login, 
      logout,
      loading 
    }}>
      {children}
    </LocalAuthContext.Provider>
  );
};

export const useAuth = () => useContext(LocalAuthContext);