import React, { useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu, X, Home, ArrowRightLeft, Building, Landmark, BookOpen,
  Settings, LogOut, Briefcase, FileBarChart2, ArrowDownCircle,
  ArrowUpCircle, Users, ShieldCheck, ShieldAlert, Network,
  Wallet, Package, FileText, Heart, FileSignature, Church,
  Calendar, ChevronRight
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { cn } from '@/lib/utils';

const navGroups = [
  {
    label: 'Inicio',
    links: [
      { icon: Home, text: 'Dashboard', path: '/' },
      { icon: Network, text: 'Mi Organización', path: '/organization' },
    ],
  },
  {
    label: 'Operación',
    links: [
      { icon: ArrowRightLeft, text: 'Transacciones', path: '/transactions' },
      { icon: FileSignature, text: 'Contratos', path: '/contracts' },
      { icon: Heart, text: 'Intenciones de Misa', path: '/mass-intentions' },
      { icon: FileText, text: 'Facturas', path: '/invoices' },
      { icon: Package, text: 'Inventario', path: '/inventory' },
    ],
  },
  {
    label: 'Tesorería y cartera',
    links: [
      { icon: Wallet, text: 'Cajas', path: '/cash-accounts' },
      { icon: Landmark, text: 'Cuentas Bancarias', path: '/bank-accounts' },
      { icon: ArrowUpCircle, text: 'Cuentas por Cobrar', path: '/accounts-receivable' },
      { icon: ArrowDownCircle, text: 'Cuentas por Pagar', path: '/accounts-payable' },
    ],
  },
  {
    label: 'Patrimonio',
    links: [
      { icon: Briefcase, text: 'Activos Fijos', path: '/fixed-assets' },
      { icon: Building, text: 'Propiedades y Oficinas', path: '/real-estates' },
    ],
  },
  {
    label: 'Análisis y control',
    links: [
      { icon: FileBarChart2, text: 'Reportes Financieros', path: '/reports' },
      { icon: FileBarChart2, text: 'Reportes Tributarios', path: '/tax-reports' },
      { icon: BookOpen, text: 'Plan de Cuentas', path: '/accounts' },
      { icon: BookOpen, text: 'Cierres Contables', path: '/book-closings' },
    ],
  },
  {
    label: 'Administración',
    links: [
      { icon: Users, text: 'Contactos', path: '/contacts' },
      { icon: Settings, text: 'Ajustes', path: '/settings' },
    ],
  },
];

const adminNavGroups = [
  {
    label: 'Administración',
    links: [
      { icon: Building, text: 'Empresas', path: '/companies' },
      { icon: Settings, text: 'Ajustes', path: '/settings' },
    ],
  },
];

const routeMeta = [
  { path: '/', section: 'Inicio', title: 'Dashboard' },
  ...navGroups.flatMap(group =>
    group.links
      .filter(link => link.path !== '/')
      .map(link => ({ path: link.path, section: group.label, title: link.text }))
  ),
  { path: '/companies', section: 'Administración', title: 'Empresas' },
];

const AccessBadge = ({ level, compact = false }) => {
  const isFull = level === 'full';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border',
        compact ? 'px-2.5 py-1' : 'mt-3 px-3 py-1.5',
        isFull
          ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
          : 'border-amber-400/20 bg-amber-400/10 text-amber-300'
      )}
    >
      {isFull
        ? <ShieldCheck className="h-3.5 w-3.5" />
        : <ShieldAlert className="h-3.5 w-3.5" />
      }
      <span className="text-[10px] font-bold uppercase tracking-[0.16em]">
        {isFull ? 'Acceso total' : 'Acceso parcial'}
      </span>
    </div>
  );
};

const OrganizationIdentity = ({ name }) => {
  const displayName = String(name || '').trim();
  const isParish = /^parroquia\b/i.test(displayName);
  const cleanName = isParish ? displayName.replace(/^parroquia\s+/i, '') : displayName;

  return (
    <div className="relative mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.055] p-3.5 shadow-[0_16px_40px_rgba(2,6,23,0.22)]">
      <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-blue-400/10 blur-2xl" />
      <div className="relative flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-300/15 bg-blue-400/10">
          <Church className="h-5 w-5 text-blue-200" strokeWidth={1.7} />
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-[9px] font-extrabold uppercase tracking-[0.23em] text-blue-300/80">
            {isParish ? 'Parroquia activa' : 'Organización activa'}
          </p>
          <p className="line-clamp-2 text-[13px] font-bold leading-[1.15rem] tracking-[0.01em] text-white">
            {cleanName || 'Sin organización seleccionada'}
          </p>
        </div>
      </div>
    </div>
  );
};

const Navigation = ({ groups, onNavigate }) => {
  const location = useLocation();

  return (
    <nav className="custom-scrollbar flex-1 overflow-y-auto px-3 pb-4 pt-2">
      {groups.map((group, groupIndex) => (
        <div key={group.label} className={groupIndex === 0 ? '' : 'mt-5'}>
          <p className="px-3 pb-2 text-[9px] font-extrabold uppercase tracking-[0.2em] text-slate-500">
            {group.label}
          </p>
          <div className="space-y-1">
            {group.links.map(link => (
              <NavLink
                key={link.path}
                to={link.path}
                end={link.path === '/'}
                onClick={onNavigate}
                className={({ isActive }) => {
                  const active = isActive || (link.path === '/reports' && location.pathname.startsWith('/reports'));
                  return cn(
                    'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-200',
                    active
                      ? 'bg-white/[0.105] text-white shadow-[inset_0_0_0_1px_rgba(96,165,250,0.14)]'
                      : 'text-slate-400 hover:bg-white/[0.055] hover:text-slate-100'
                  );
                }}
              >
                {({ isActive }) => {
                  const active = isActive || (link.path === '/reports' && location.pathname.startsWith('/reports'));
                  return (
                    <>
                      <span
                        className={cn(
                          'absolute left-0 top-2.5 h-5 w-[3px] rounded-r-full transition-opacity',
                          active ? 'bg-blue-400 opacity-100' : 'opacity-0'
                        )}
                      />
                      <link.icon
                        className={cn(
                          'h-[18px] w-[18px] shrink-0 transition-colors',
                          active ? 'text-blue-300' : 'text-slate-500 group-hover:text-slate-300'
                        )}
                        strokeWidth={1.8}
                      />
                      <span className="truncate">{link.text}</span>
                    </>
                  );
                }}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
};

const SidebarContent = ({ onLogout, onNavigate, mobile = false }) => {
  const { activeCompany, isGeneralAdmin, accessLevel } = useCompany();

  const groups = useMemo(() => {
    const source = isGeneralAdmin ? adminNavGroups : navGroups;
    if (!isGeneralAdmin && accessLevel === 'partial') {
      return source
        .map(group => ({
          ...group,
          links: group.links.filter(link => link.path !== '/settings'),
        }))
        .filter(group => group.links.length > 0);
    }
    return source;
  }, [isGeneralAdmin, accessLevel]);

  return (
    <>
      <div className="shrink-0 px-5 pb-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative">
              <div className="absolute inset-1 rounded-xl bg-blue-400/20 blur-lg" />
              <img
                src="/hertur-contabilidad-mark.svg?v=20260921b"
                alt=""
                aria-hidden="true"
                className="relative h-11 w-11 shrink-0 drop-shadow-lg"
              />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-extrabold uppercase tracking-[0.3em] text-blue-300">HERTUR</p>
              <h2 className="text-[17px] font-extrabold leading-tight tracking-[-0.01em] text-white">Contabilidad</h2>
              <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Gestión financiera</p>
            </div>
          </div>

          {mobile && (
            <button
              type="button"
              onClick={onNavigate}
              aria-label="Cerrar menú"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {activeCompany && <OrganizationIdentity name={activeCompany.name} />}

        {isGeneralAdmin && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">Sesión actual</p>
            <p className="mt-1 text-sm font-semibold text-slate-200">Administrador General</p>
          </div>
        )}

        {!isGeneralAdmin && <AccessBadge level={accessLevel} />}
      </div>

      <Navigation groups={groups} onNavigate={onNavigate} />

      <div className="shrink-0 border-t border-white/[0.065] p-3">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300"
        >
          <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </>
  );
};

const DesktopSidebar = ({ onLogout }) => (
  <aside className="app-sidebar hidden h-screen w-[284px] shrink-0 flex-col md:flex">
    <SidebarContent onLogout={onLogout} />
  </aside>
);

const MobileSidebar = ({ isOpen, setIsOpen, onLogout }) => (
  <AnimatePresence>
    {isOpen && (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
        />

        <motion.aside
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="app-sidebar fixed inset-y-0 left-0 z-50 flex w-[286px] flex-col md:hidden"
        >
          <SidebarContent
            onLogout={() => {
              onLogout();
              setIsOpen(false);
            }}
            onNavigate={() => setIsOpen(false)}
            mobile
          />
        </motion.aside>
      </>
    )}
  </AnimatePresence>
);

const Layout = ({ children, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { activeCompany, isGeneralAdmin, accessLevel } = useCompany();

  const currentMeta = useMemo(() => {
    if (location.pathname === '/') return routeMeta[0];

    return routeMeta.find(
      item => item.path !== '/' && location.pathname.startsWith(item.path)
    ) || { section: 'HERTUR', title: 'Contabilidad' };
  }, [location.pathname]);

  const todayLabel = useMemo(
    () => new Intl.DateTimeFormat('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date()),
    []
  );

  return (
    <div className="app-shell relative min-h-screen md:flex">
      <DesktopSidebar onLogout={onLogout} />

      <MobileSidebar
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        onLogout={onLogout}
      />

      <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <header className="app-topbar shrink-0 border-b border-slate-200/70">
          <div className="flex min-h-[68px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Abrir menú"
                className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 md:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="min-w-0">
                <div className="hidden items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 sm:flex">
                  <span>HERTUR</span>
                  <ChevronRight className="h-3 w-3" />
                  <span>{currentMeta.section}</span>
                </div>
                <p className="truncate text-[15px] font-extrabold tracking-[-0.01em] text-slate-900 sm:mt-0.5 sm:text-base">
                  {currentMeta.title}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-xs text-slate-500 shadow-sm lg:flex">
                <Calendar className="h-4 w-4 text-slate-400" />
                <span className="capitalize">{todayLabel}</span>
              </div>

              <div className="hidden min-w-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-white/85 px-3 py-2 shadow-sm sm:flex">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                  {isGeneralAdmin
                    ? <Building className="h-4 w-4" />
                    : <Church className="h-4 w-4" />
                  }
                </div>
                <div className="min-w-0">
                  <p className="max-w-[210px] truncate text-xs font-bold text-slate-800">
                    {isGeneralAdmin
                      ? 'Administración General'
                      : (activeCompany?.name || 'Organización')
                    }
                  </p>
                  <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    {isGeneralAdmin
                      ? 'Control global'
                      : (accessLevel === 'full' ? 'Acceso total' : 'Acceso parcial')
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="app-workspace custom-scrollbar flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1680px] p-4 sm:p-6 lg:p-8 xl:p-9">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Layout;
