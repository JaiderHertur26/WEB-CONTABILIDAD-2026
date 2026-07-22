import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Transactions from '@/pages/Transactions';
import Reports from '@/pages/Reports';
import Contacts from '@/pages/Contacts';
import Accounts from '@/pages/Accounts';
import BankAccounts from '@/pages/BankAccounts';
import BookClosings from '@/pages/BookClosings';
import Settings from '@/pages/Settings';
import Login from '@/pages/Login';
import Companies from '@/pages/Companies';
import FixedAssets from '@/pages/FixedAssets';
import RealEstates from '@/pages/RealEstates';
import TaxReports from '@/pages/TaxReports';
import AccountsReceivable from '@/pages/AccountsReceivable';
import AccountsPayable from '@/pages/AccountsPayable';
import Organization from '@/pages/Organization';
import CashAccounts from '@/pages/CashAccounts';
import Inventory from '@/pages/Inventory';
import Invoices from '@/pages/Invoices';
import MassIntentions from '@/pages/MassIntentions'; // NUEVA IMPORTACIÓN
import { Toaster } from '@/components/ui/toaster';
import { LocalAuthProvider, useAuth } from '@/contexts/LocalAuthContext';
import { CompanyProvider } from '@/contexts/CompanyContext';
import { migrateFromLocalStorage } from '@/lib/storageMigration';
import { Loader2 } from 'lucide-react';

// Main routing logic wrapper
const AppRoutes = () => {
  const { isAuthenticated, isGeneralAdmin, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 flex-col gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <p>Cargando sesión...</p>
      </div>
    );
  }

  const MainApp = () => (
    <Layout onLogout={logout}>
      <Routes>
        <Route path="/" element={isGeneralAdmin ? <Navigate to="/companies" /> : <Dashboard />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/settings" element={<Settings />} />

        <Route path="/organization" element={!isGeneralAdmin ? <Organization /> : <Navigate to="/companies" />} />
        <Route path="/transactions" element={!isGeneralAdmin ? <Transactions /> : <Navigate to="/companies" />} />
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
        
        {/* NUEVA RUTA: Libro Diario de Misa */}
        <Route path="/mass-intentions" element={!isGeneralAdmin ? <MassIntentions /> : <Navigate to="/companies" />} />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );

  return !isAuthenticated ? (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 flex-col gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <p>Optimizando base de datos...</p>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Sistema de Contabilidad</title>
        <meta name="description" content="Gestiona tu contabilidad de forma profesional." />
      </Helmet>

      <LocalAuthProvider>
        <CompanyProvider>
          <Router>
            <Toaster />
            <AppRoutes />
          </Router>
        </CompanyProvider>
      </LocalAuthProvider>
    </>
  );
}

export default App;