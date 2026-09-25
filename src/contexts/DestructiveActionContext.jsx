import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { ShieldAlert, Eye, EyeOff, LockKeyhole, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/LocalAuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { secureDestructiveAdminLogin, secureDestructiveCompanyLogin, sessionLogout } from '@/lib/secureApi';

const DestructiveActionContext = createContext(null);

const initialRequestState = {
  open: false,
  title: 'Confirmar eliminación',
  description: '',
  subject: '',
};

export const DestructiveActionProvider = ({ children }) => {
  const { isGeneralAdmin } = useAuth();
  const { activeCompany } = useCompany();
  const resolverRef = useRef(null);
  const [request, setRequest] = useState(initialRequestState);
  const [password, setPassword] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');

  const resetDialog = useCallback(() => {
    setRequest(initialRequestState);
    setPassword('');
    setAdminUsername('');
    setShowPassword(false);
    setValidating(false);
    setError('');
  }, []);

  const finishRequest = useCallback((result) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    resetDialog();
    if (resolver) resolver(result);
  }, [resetDialog]);

  const requestDestructiveAuthorization = useCallback((details = {}) => {
    if (resolverRef.current) {
      return Promise.reject(new Error('Ya existe una autorización destructiva pendiente.'));
    }

    return new Promise(resolve => {
      resolverRef.current = resolve;
      setPassword('');
      setAdminUsername('');
      setShowPassword(false);
      setError('');
      setRequest({
        open: true,
        title: details.title || 'Confirmar eliminación',
        description: details.description || '',
        subject: details.subject || '',
      });
    });
  }, []);

  const releaseDestructiveAuthorization = useCallback(async (authorization) => {
    const token = authorization?.sessionToken;
    if (!token) return;
    try {
      await sessionLogout(token);
    } catch (releaseError) {
      console.warn('No fue posible cerrar la sesión temporal de autorización.', releaseError);
    }
  }, []);

  const cancel = useCallback(() => {
    if (validating) return;
    finishRequest(null);
  }, [finishRequest, validating]);

  const validate = useCallback(async () => {
    if (!password.trim()) {
      setError(isGeneralAdmin
        ? 'Ingresa la contraseña del Administrador General.'
        : 'Ingresa la contraseña de Acceso Total.');
      return;
    }

    setValidating(true);
    setError('');

    let temporarySession = null;
    try {
      if (isGeneralAdmin) {
        if (!adminUsername.trim()) {
          setError('Ingresa el usuario del Administrador General.');
          setValidating(false);
          return;
        }

        const result = await secureDestructiveAdminLogin(adminUsername.trim(), password);
        temporarySession = result?.sessionToken || null;

        if (!result?.success || result?.accessLevel !== 'admin' || !temporarySession) {
          if (temporarySession) await sessionLogout(temporarySession).catch(() => {});
          setError(result?.message || 'Las credenciales administrativas no son válidas.');
          setValidating(false);
          return;
        }

        finishRequest({
          approved: true,
          sessionToken: temporarySession,
          accessLevel: 'admin',
          companyId: null,
        });
        return;
      }

      if (!activeCompany?.id || !activeCompany?.username) {
        setError('No se encontró el usuario seguro de la entidad activa.');
        setValidating(false);
        return;
      }

      const result = await secureDestructiveCompanyLogin(activeCompany.username, password);
      temporarySession = result?.sessionToken || null;
      const sameCompany = String(result?.company?.id || '') === String(activeCompany.id);

      if (!result?.success || !sameCompany || result?.accessLevel !== 'full' || !temporarySession) {
        if (temporarySession) await sessionLogout(temporarySession).catch(() => {});

        if (result?.success && result?.accessLevel === 'partial') {
          setError('La contraseña ingresada corresponde a Acceso Parcial. Para eliminar se requiere Acceso Total.');
        } else {
          setError(result?.message || 'La contraseña de Acceso Total no es válida.');
        }
        setValidating(false);
        return;
      }

      finishRequest({
        approved: true,
        sessionToken: temporarySession,
        accessLevel: 'full',
        companyId: String(activeCompany.id),
      });
    } catch (validationError) {
      if (temporarySession) await sessionLogout(temporarySession).catch(() => {});
      console.error('Error validando eliminación:', validationError);
      setError('No fue posible validar la contraseña. La eliminación queda bloqueada.');
      setValidating(false);
    }
  }, [activeCompany, adminUsername, finishRequest, isGeneralAdmin, password]);

  const value = useMemo(() => ({
    requestDestructiveAuthorization,
    releaseDestructiveAuthorization,
  }), [releaseDestructiveAuthorization, requestDestructiveAuthorization]);

  return (
    <DestructiveActionContext.Provider value={value}>
      {children}

      <Dialog open={request.open} onOpenChange={(open) => { if (!open) cancel(); }}>
        <DialogContent
          className="sm:max-w-md overflow-hidden border-0 p-0 shadow-2xl"
          onPointerDownOutside={(event) => { if (validating) event.preventDefault(); }}
          onEscapeKeyDown={(event) => { if (validating) event.preventDefault(); }}
        >
          <div className="bg-gradient-to-br from-rose-700 via-rose-600 to-red-700 px-6 py-5 text-white">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <DialogHeader className="space-y-1 text-left">
                <DialogTitle className="text-xl font-bold text-white">{request.title}</DialogTitle>
                <DialogDescription className="text-sm leading-5 text-rose-50/90">
                  Esta es una acción protegida. No se eliminará nada sin una revalidación segura.
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>

          <div className="space-y-5 px-6 py-6">
            {(request.subject || request.description) && (
              <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4">
                {request.subject && <p className="text-sm font-bold text-slate-900">{request.subject}</p>}
                {request.description && <p className="mt-1 text-sm leading-5 text-slate-600">{request.description}</p>}
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex gap-3">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                <p className="text-xs leading-5 text-slate-600">
                  {isGeneralAdmin
                    ? 'Confirma con las credenciales del Administrador General.'
                    : <>Confirma con la <strong>contraseña de Acceso Total</strong> de {activeCompany?.name || 'la entidad activa'}. La contraseña de Acceso Parcial no autoriza eliminaciones.</>}
                </p>
              </div>
            </div>

            {isGeneralAdmin && (
              <div className="space-y-2">
                <Label htmlFor="destructive-admin-user">Usuario administrador</Label>
                <input
                  id="destructive-admin-user"
                  value={adminUsername}
                  onChange={(event) => setAdminUsername(event.target.value)}
                  autoComplete="username"
                  disabled={validating}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
                  placeholder="Usuario del Administrador General"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="destructive-password">
                {isGeneralAdmin ? 'Contraseña administrativa' : 'Contraseña de Acceso Total'}
              </Label>
              <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-white px-3 transition focus-within:border-rose-300 focus-within:ring-4 focus-within:ring-rose-100">
                <input
                  id="destructive-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter' && !validating) validate(); }}
                  autoComplete="current-password"
                  autoFocus={!isGeneralAdmin}
                  disabled={validating}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  placeholder={isGeneralAdmin ? 'Contraseña administrativa' : 'Contraseña de Acceso Total'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(value => !value)}
                  disabled={validating}
                  className="ml-2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={cancel} disabled={validating}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={validate}
                disabled={validating || !password.trim() || (isGeneralAdmin && !adminUsername.trim())}
                className="gap-2"
              >
                {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                {validating ? 'Validando...' : 'Autorizar eliminación'}
              </Button>
            </div>

            <p className="text-center text-[11px] leading-4 text-slate-400">
              La contraseña se valida contra el servicio seguro y no se guarda en el dispositivo.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </DestructiveActionContext.Provider>
  );
};

export const useDestructiveAction = () => {
  const context = useContext(DestructiveActionContext);
  if (!context) {
    throw new Error('useDestructiveAction debe usarse dentro de DestructiveActionProvider.');
  }
  return context;
};
