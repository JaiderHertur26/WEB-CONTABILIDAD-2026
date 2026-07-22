
import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu, X, Home, ArrowRightLeft, Building, Landmark, BookOpen,
  Settings, LogOut, Briefcase, FileBarChart2, ArrowDownCircle,
  ArrowUpCircle, Users, ShieldCheck, ShieldAlert, Network,
  Wallet, Package, FileText, Heart
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';

/* =========================
   Navigation configuration
========================= */

const navLinks = [
  { icon: Home, text: 'Dashboard', path: '/' },
  { icon: Network, text: 'Mi Organización', path: '/organization' },
  { icon: ArrowRightLeft, text: 'Transacciones', path: '/transactions' },
  { icon: Heart, text: 'Intenciones de Misa', path: '/mass-intentions' },
  { icon: FileText, text: 'Facturas', path: '/invoices' },
  { icon: Package, text: 'Inventario', path: '/inventory' },
  { icon: Wallet, text: 'Cajas', path: '/cash-accounts' },
  { icon: Landmark, text: 'Cuentas Bancarias', path: '/bank-accounts' },
  { icon: Briefcase, text: 'Activos Fijos', path: '/fixed-assets' },
  { icon: Building, text: 'Propiedades y Oficinas', path: '/real-estates' },
  { icon: Users, text: 'Contactos', path: '/contacts' },
  { icon: ArrowUpCircle, text: 'Cuentas por Cobrar', path: '/accounts-receivable' },
  { icon: ArrowDownCircle, text: 'Cuentas por Pagar', path: '/accounts-payable' },
  { icon: FileBarChart2, text: 'Reportes Financieros', path: '/reports' },
  { icon: FileBarChart2, text: 'Reportes Tributarios', path: '/tax-reports' },
  { icon: BookOpen, text: 'Plan de Cuentas', path: '/accounts' },
  { icon: BookOpen, text: 'Cierres Contables', path: '/book-closings' },
  { icon: Settings, text: 'Ajustes', path: '/settings' },
];

const adminNavLinks = [
  { icon: Building, text: 'Empresas', path: '/companies' },
  { icon: Settings, text: 'Ajustes', path: '/settings' },
];

/* =========================
   Access badge
========================= */

const AccessBadge = ({ level }) => {
  const isFull = level === 'full';

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border mt-2
        ${isFull
          ? 'bg-green-900/30 border-green-800'
          : 'bg-orange-900/30 border-orange-800'
        }`}
    >
      {isFull
        ? <ShieldCheck className="w-4 h-4 text-green-400" />
        : <ShieldAlert className="w-4 h-4 text-orange-400" />
      }
      <span
        className={`text-xs font-bold uppercase tracking-wide
          ${isFull ? 'text-green-400' : 'text-orange-400'}`}
      >
        {isFull ? 'Acceso Total' : 'Acceso Parcial'}
      </span>
    </div>
  );
};

/* =========================
   Sidebar (desktop)
========================= */

const Sidebar = ({ onLogout }) => {
  const location = useLocation();
  const { activeCompany, isGeneralAdmin, accessLevel } = useCompany();

  let links = isGeneralAdmin ? adminNavLinks : navLinks;

  if (!isGeneralAdmin && accessLevel === 'partial') {
    links = links.filter(l => l.path !== '/settings');
  }

  return (
    <aside className="bg-slate-900 text-white w-64 flex flex-col h-screen">
      {/* Header */}
      <div className="px-6 py-6 shrink-0">
        <h2 className="text-2xl font-extrabold tracking-wider">JaiderHerTur26</h2>
        {activeCompany && (
          <p className="text-sm text-slate-400 truncate mt-1">
            {activeCompany.name}
          </p>
        )}
        {isGeneralAdmin && (
          <p className="text-sm text-slate-400 mt-1">Admin General</p>
        )}
        {!isGeneralAdmin && <AccessBadge level={accessLevel} />}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1 custom-scrollbar">
        {links.map(link => (
          <NavLink
            key={link.text}
            to={link.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
              ${isActive || (link.path === '/reports' && location.pathname.startsWith('/reports'))
                ? 'bg-blue-600 text-white shadow-lg'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`
            }
          >
            <link.icon className="w-5 h-5 shrink-0" />
            <span className="truncate">{link.text}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800 shrink-0">
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-300 hover:bg-red-600 hover:text-white w-full transition"
        >
          <LogOut className="w-5 h-5" />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
};

/* =========================
   Mobile sidebar
========================= */

const MobileSidebar = ({ isOpen, setIsOpen, onLogout }) => {
  const location = useLocation();
  const { activeCompany, isGeneralAdmin, accessLevel } = useCompany();

  let links = isGeneralAdmin ? adminNavLinks : navLinks;

  if (!isGeneralAdmin && accessLevel === 'partial') {
    links = links.filter(l => l.path !== '/settings');
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={() => setIsOpen(false)}
          />

          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-y-0 left-0 w-64 bg-slate-900 text-white z-50 flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-6 shrink-0">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-extrabold">JaiderHerTur26</h2>
                <button onClick={() => setIsOpen(false)}>
                  <X className="w-6 h-6 text-slate-400 hover:text-white" />
                </button>
              </div>
              {activeCompany && (
                <p className="text-sm text-slate-400 truncate mt-1">
                  {activeCompany.name}
                </p>
              )}
              {isGeneralAdmin && (
                <p className="text-sm text-slate-400 mt-1">Admin General</p>
              )}
              {!isGeneralAdmin && <AccessBadge level={accessLevel} />}
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
              {links.map(link => (
                <NavLink
                  key={link.text}
                  to={link.path}
                  onClick={() => setIsOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                    ${isActive || (link.path === '/reports' && location.pathname.startsWith('/reports'))
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`
                  }
                >
                  <link.icon className="w-5 h-5" />
                  <span className="truncate">{link.text}</span>
                </NavLink>
              ))}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800">
              <button
                onClick={() => { onLogout(); setIsOpen(false); }}
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-300 hover:bg-red-600 hover:text-white w-full"
              >
                <LogOut className="w-5 h-5" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

/* =========================
   Layout
========================= */

const Layout = ({ children, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="relative min-h-screen md:flex bg-slate-100">
      <div className="hidden md:block w-64 shrink-0">
        <Sidebar onLogout={onLogout} />
      </div>

      <MobileSidebar
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        onLogout={onLogout}
      />

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="md:hidden p-4 bg-white border-b flex items-center">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="w-6 h-6 text-slate-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
