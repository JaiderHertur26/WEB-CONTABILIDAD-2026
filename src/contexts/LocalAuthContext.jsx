import React, { createContext, useContext, useState, useEffect } from 'react';
import { storage } from '@/lib/storage';

const LocalAuthContext = createContext();

// --- Helper Functions for Company Management & Restoration ---

export const getCompanies = async () => {
  try {
    const data = await storage.getItem('companies');
    return JSON.parse(data || '[]');
  } catch (e) {
    console.error("Error reading companies from storage:", e);
    return [];
  }
};

export const saveCompanies = async (companies) => {
  try {
    await storage.setItem('companies', JSON.stringify(companies));
  } catch (e) {
    console.error("Error saving companies to storage:", e);
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