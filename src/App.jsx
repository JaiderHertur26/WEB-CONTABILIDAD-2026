import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import Layout from '@/components/Layout';
import NativeAppBridge from '@/components/NativeAppBridge';
import { Toaster } from '@/components/ui/toaster';
import { LocalAuthProvider, useAuth } from '@/contexts/LocalAuthContext';
import { CompanyProvider } from '@/contexts/CompanyContext';
import { migrateFromLocalStorage } from '@/lib/storageMigration';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Transactions = lazy(() => import('@/pages/Transactions'));
const Reports = lazy(() => import('@/pages/Reports'));
const Contacts = lazy(() => import('@/pages/Contacts'));
const Accounts = lazy(() => import('@/pages/Accounts'));
const BankAccounts = lazy(() => import('@/pages/BankAccounts'));
const BookClosings = lazy(() => import('@/pages/BookClosings'));
const Settings = lazy(() => import('@/pages/Settings'));
const Login = lazy(() => import('@/pages/Login'));
const Companies = lazy(() => import('@/pages/Companies'));
const FixedAssets = lazy(() => import('@/pages/FixedAssets'));
const RealEstates = lazy(() => import('@/pages/RealEstates'));
const TaxReports = lazy(() => import('@/pages/TaxReports'));
const AccountsReceivable = lazy(() => import('@/pages/AccountsReceivable'));
const AccountsPayable = lazy(() => import('@/pages/AccountsPayable'));
const Organization = lazy(() => import('@/pages/Organization'));
const CashAccounts = lazy(() => import('@/pages/CashAccounts'));
const Inventory = lazy(() => import('@/pages/Inventory'));
const Invoices = lazy(() => import('@/pages/Invoices'));
const MassIntentions = lazy(() => import('@/pages/MassIntentions'));
const Contracts = lazy(() => import('@/pages/Contracts'));

const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;

const LoadingScreen = ({ message = 'Preparando tu espacio de trabajo...', compact = false }) => (
  <div className={compact
    ? 'flex min-h-[320px] items-center justify-center'
    : 'flex min-h-screen items-center justify-center bg-[#f5f7fb]'
  }>
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="absolute inset-2 rounded-xl bg-blue-500/10 blur-md" />
        <Loader2 className="relative h-6 w-6 animate-spin text-blue-600" />
      </div>
      <div>
        <p className="text-sm font-bold text-slate-700">HERTUR Contabilidad</p>
        <p className="mt-1 text-xs text-slate-400">{message}</p>
      </div>
    </div>
  </div>
);

const AppRoutes = () => {
  const { isAuthenticated, isGeneralAdmin, loading, logout } = useAuth();

  if (loading) {
    return <LoadingScreen message="Validando sesión segura..." />;
  }

  const MainApp = () => (
    <Layout onLogout={logout}>
      <Suspense fallback={<LoadingScreen compact />}>
        <Routes>
          <Route path="/" element={isGeneralAdmin ? <Navigate to="/companies" /> : <Dashboard />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/settings" element={<Settings />} />

          <Route path="/organization" element={!isGeneralAdmin ? <Organization /> : <Navigate to="/companies" />} />
          <Route path="/transactions" element={!isGeneralAdmin ? <Transactions /> : <Navigate to="/companies" />} />
          <Route path="/contracts" element={!isGeneralAdmin ? <Contracts /> : <Navigate to="/companies" />} />
          <Route path="/invoices" element={!isGeneralAdmin ? <Invoices /> : <Navigate to="/companies" />} />
          <Route path="/inventory" element={!isGeneralAdmin ? <Inventory /> : <Navigate to="/companies" />} />
          <Route path="/cash-accounts" element={!isGeneralAdmin ? <CashAccounts /> : <Navigate to="/companies" />} />
          <Route path="/bank-accounts" element={!isGeneralAdmin ? <BankAccounts /> : <Navigate to="/companies" />} />
          <Route path="/fixed-assets" element={!isGeneralAdmin ? <FixedAssets /> : <Navigate to="/companies" />} />
          <Route path="/real-estates" element={!isGeneralAdmin ? <RealEstates /> : <Navigate to="/companies" />} />
          <Route path="/reports" element={!isGeneralAdmin ? <Reports /> : <Navigate to="/companies" />} />
          <Route path="/tax-reports" element={!isGeneralAdmin ? <TaxReports /> : <Navigate to="/companies" />} />
          <Route path="/contacts" element={!isGeneralAdmin ? <Contacts /> : <Navigate to="/companies" />} />
          <Route path="/accounts" element={!isGeneralAdmin ? <Accounts /> : <Navigate to="/companies" />} />
          <Route path="/book-closings" element={!isGeneralAdmin ? <BookClosings /> : <Navigate to="/companies" />} />
          <Route path="/accounts-receivable" element={!isGeneralAdmin ? <AccountsReceivable /> : <Navigate to="/companies" />} />
          <Route path="/accounts-payable" element={!isGeneralAdmin ? <AccountsPayable /> : <Navigate to="/companies" />} />
          <Route path="/mass-intentions" element={!isGeneralAdmin ? <MassIntentions /> : <Navigate to="/companies" />} />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </Layout>
  );

  return !isAuthenticated ? (
    <Suspense fallback={<LoadingScreen message="Cargando acceso seguro..." />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </Suspense>
  ) : (
    <MainApp />
  );
};

function App() {
  const [isMigrated, setIsMigrated] = useState(false);

  useEffect(() => {
    const initStorage = async () => {
      await migrateFromLocalStorage();
      setIsMigrated(true);
    };

    initStorage();
  }, []);

  if (!isMigrated) {
    return <LoadingScreen message="Optimizando base de datos local..." />;
  }

  return (
    <>
      <Helmet>
        <title>HERTUR · Contabilidad</title>
        <meta name="description" content="Sistema contable y financiero HERTUR." />
        <meta name="theme-color" content="#0B1220" />
      </Helmet>

      <LocalAuthProvider>
        <CompanyProvider>
          <Router>
            <NativeAppBridge />
            <Toaster />
            <AppRoutes />
          </Router>
        </CompanyProvider>
      </LocalAuthProvider>
    </>
  );
}

export default App;
