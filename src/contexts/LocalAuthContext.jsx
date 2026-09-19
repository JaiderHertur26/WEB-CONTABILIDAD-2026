import React, { createContext, useContext, useState, useEffect } from 'react';
import { storage } from '@/lib/storage';
import { listLoginCompanies, sessionCompanies, sessionLogout } from '@/lib/secureApi';

const LocalAuthContext = createContext();

export const getCompanies = async () => {
  try {
    const data = await listLoginCompanies();
    return (data || []).map(comp => ({
      ...comp,
      doc: comp.doc_nit,
      parentId: comp.parent_id,
      isActive: !!comp.is_active,
    }));
  } catch (e) {
    console.error("Error al consultar directorio seguro:", e);
    return [];
  }
};

export const saveCompanies = async () => {
  throw new Error('El guardado directo de empresas fue deshabilitado. Usa los flujos seguros de sesión.');
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
  const [sessionToken, setSessionToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const session = await storage.getItem('auth_session');
        const level = await storage.getItem('auth_access_level') || 'full';
        const token = await storage.getItem('app_session_token');

        if (session && token) {
          try {
            const scope = await sessionCompanies(token);
            const isAdminSession = session === 'general_admin';
            const validCompanySession = isAdminSession || (Array.isArray(scope) && scope.some(company => String(company.id) === String(session)));
            if (!validCompanySession) throw new Error('La sesión ya no tiene acceso a la entidad');

            setIsAuthenticated(true);
            setActiveSessionId(session);
            setSessionToken(token);
            setAccessLevel(level);
            setIsGeneralAdmin(isAdminSession);
          } catch (sessionError) {
            console.warn('Sesión local vencida o inválida; se solicitará un nuevo acceso.', sessionError);
            await storage.removeItem('auth_session');
            await storage.removeItem('auth_access_level');
            await storage.removeItem('app_session_token');
          }
        } else if (session || token) {
          await storage.removeItem('auth_session');
          await storage.removeItem('auth_access_level');
          await storage.removeItem('app_session_token');
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
    if (!data.sessionToken) throw new Error('La sesión segura no fue emitida por el servidor.');
    setIsAuthenticated(true);
    setSessionToken(data.sessionToken);
    setAccessLevel(data.accessLevel || 'full');
    await storage.setItem('app_session_token', data.sessionToken);
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
    try { await sessionLogout(sessionToken); } catch (error) { console.warn('No fue posible cerrar la sesión remota:', error); }
    setIsAuthenticated(false);
    setIsGeneralAdmin(false);
    setActiveSessionId(null);
    setSessionToken(null);
    setAccessLevel('full');
    await storage.removeItem('auth_session');
    await storage.removeItem('auth_access_level');
    await storage.removeItem('app_session_token');
  };

  return (
    <LocalAuthContext.Provider value={{ 
      isAuthenticated, isGeneralAdmin, accessLevel, activeSessionId, sessionToken, login, logout, loading
    }}>
      {children}
    </LocalAuthContext.Provider>
  );
};

export const useAuth = () => useContext(LocalAuthContext);