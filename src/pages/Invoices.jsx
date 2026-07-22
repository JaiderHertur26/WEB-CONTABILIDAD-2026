import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, Search, FileText, Filter, Calendar, FileCheck, Eye, Printer, Download, CheckSquare, Square, Trash2, Check, ChevronsUpDown, ShoppingCart, ShoppingBag, BadgeDollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { format, isWithinInterval, startOfDay, endOfDay, parseISO } from 'date-fns';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import InvoiceDetail from '@/components/invoices/InvoiceDetail';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import ContactSelector from '@/components/transactions/ContactSelector';

const Invoices = () => {
  const { activeCompany } = useCompany();
  const [transactions] = useCompanyData('transactions');
  const [invoices, saveInvoices] = useCompanyData('invoices');
  const [purchaseInvoices, savePurchaseInvoices] = useCompanyData('purchase_invoices');
  const [contacts] = useCompanyData('contacts');
  const { toast } = useToast();

  const [mainTab, setMainTab] = useState('sales');
  const [activeTab, setActiveTab] = useState('generate');
  const [activePurchaseTab, setActivePurchaseTab] = useState('generate');
  
  // ================= SALES STATES =================
  const [filterContactId, setFilterContactId] = useState('');
  const [dateFrom, setDateFrom] = useState(format(startOfDay(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfDay(new Date()), 'yyyy-MM-dd'));
  const [selectedSales, setSelectedSales] = useState([]);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [salesTypeFilter, setSalesTypeFilter] = useState('all');

  // ================= PURCHASES STATES =================
  const [filterSupplierId, setFilterSupplierId] = useState('');
  const [dateFromPurchase, setDateFromPurchase] = useState(format(startOfDay(new Date()), 'yyyy-MM-dd'));
  const [dateToPurchase, setDateToPurchase] = useState(format(endOfDay(new Date()), 'yyyy-MM-dd'));
  const [selectedPurchases, setSelectedPurchases] = useState([]);
  const [isGeneratePurchaseModalOpen, setIsGeneratePurchaseModalOpen] = useState(false);
  const [purchasesTypeFilter, setPurchasesTypeFilter] = useState('all');

  // ================= SHARED/DETAIL STATES =================
  const [viewInvoice, setViewInvoice] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);


  // ================= SALES LOGIC =================
  const filteredSales = useMemo(() => {
    if (!transactions) return [];
    let sales = transactions.filter(t => 
        t.type === 'income' && 
        t.contactId && 
        !['eliminado', 'anulado'].includes(t.status?.toLowerCase())
    );
    if (filterContactId) sales = sales.filter(t => t.contactId === filterContactId);
    if (dateFrom && dateTo) {
        const start = startOfDay(parseISO(dateFrom));
        const end = endOfDay(parseISO(dateTo));
        sales = sales.filter(t => isWithinInterval(parseISO(t.date), { start, end }));
    }
    return sales.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions, filterContactId, dateFrom, dateTo]);

  const filteredHistorySales = useMemo(() => {
    if (!invoices) return [];
    let res = [...invoices];
    if (salesTypeFilter !== 'all') {
        if (salesTypeFilter === 'sale') res = res.filter(i => i.type === 'sale');
        else if (salesTypeFilter === 'income') res = res.filter(i => i.type === 'income');
    }
    return res.reverse();
  }, [invoices, salesTypeFilter]);

  const toggleSaleSelection = (id) => {
      setSelectedSales(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAllSales = () => {
      if (selectedSales.length === filteredSales.length) setSelectedSales([]);
      else setSelectedSales(filteredSales.map(s => s.id));
  };

  const handleOpenGenerateModal = () => {
      if (selectedSales.length === 0) return;
      const firstId = selectedSales[0];
      const firstSale = filteredSales.find(s => s.id === firstId);
      const hasDifferentCustomer = selectedSales.some(id => filteredSales.find(x => x.id === id)?.contactId !== firstSale.contactId);

      if (hasDifferentCustomer) {
          toast({ variant: 'destructive', title: "Error de Validación", description: "Selecciona ventas de un mismo cliente." });
          return;
      }
      setIsGenerateModalOpen(true);
  };

  const handleGenerateInvoice = () => {
      const salesToInvoice = filteredSales.filter(s => selectedSales.includes(s.id));
      if (salesToInvoice.length === 0) return;

      const firstSale = salesToInvoice[0];
      const contact = contacts?.find(c => c.id === firstSale.contactId);
      const totalAmount = salesToInvoice.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
      
      const dates = salesToInvoice.map(s => new Date(s.date));
      const minDate = new Date(Math.min.apply(null, dates));
      const maxDate = new Date(Math.max.apply(null, dates));
      const dateRangeStr = `${format(minDate, 'dd/MM/yyyy')} - ${format(maxDate, 'dd/MM/yyyy')}`;

      // CORRECCIÓN: Consecutivo seguro buscando el número más alto emitido
      const maxSaleNum = (invoices || []).reduce((max, inv) => {
          const match = inv.invoiceNumber?.match(/\d+$/);
          const num = match ? parseInt(match[0], 10) : 0;
          return num > max ? num : max;
      }, 0);
      const invoiceNum = `FAC-${String(maxSaleNum + 1).padStart(4, '0')}`;

      const newInvoice = {
          id: `inv-${Date.now()}`,
          type: 'sale',
          sourceType: 'sale',
          invoiceNumber: invoiceNum,
          createdAt: new Date().toISOString(),
          clientData: contact || { name: 'Cliente Desconocido', id: firstSale.contactId },
          items: salesToInvoice,
          total: totalAmount,
          status: 'issued',
          dateRange: dateRangeStr
      };

      saveInvoices([...(invoices || []), newInvoice]);
      setSelectedSales([]);
      setIsGenerateModalOpen(false);
      toast({ title: "¡Factura Generada!", description: `Factura ${invoiceNum} creada exitosamente.` });
      setActiveTab('history');
  };


  // ================= PURCHASES LOGIC =================
  const filteredPurchases = useMemo(() => {
      if (!transactions) return [];
      let purchases = transactions.filter(t => 
          t.type === 'expense' && 
          t.isPurchase === true &&
          t.contactId &&
          !['eliminado', 'anulado'].includes(t.status?.toLowerCase())
      );
      if (filterSupplierId) purchases = purchases.filter(t => t.contactId === filterSupplierId);
      if (dateFromPurchase && dateToPurchase) {
          const start = startOfDay(parseISO(dateFromPurchase));
          const end = endOfDay(parseISO(dateToPurchase));
          purchases = purchases.filter(t => isWithinInterval(parseISO(t.date), { start, end }));
      }
      return purchases.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions, filterSupplierId, dateFromPurchase, dateToPurchase]);

  const filteredHistoryPurchases = useMemo(() => {
    if (!purchaseInvoices) return [];
    let res = [...purchaseInvoices];
    if (purchasesTypeFilter !== 'all') {
        if (purchasesTypeFilter === 'purchase') res = res.filter(i => i.type === 'purchase');
        else if (purchasesTypeFilter === 'expense') res = res.filter(i => i.type === 'expense');
    }
    return res.reverse();
  }, [purchaseInvoices, purchasesTypeFilter]);

  const togglePurchaseSelection = (id) => {
      setSelectedPurchases(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAllPurchases = () => {
      if (selectedPurchases.length === filteredPurchases.length) setSelectedPurchases([]);
      else setSelectedPurchases(filteredPurchases.map(s => s.id));
  };

  const handleOpenGeneratePurchaseModal = () => {
      if (selectedPurchases.length === 0) return;
      const firstId = selectedPurchases[0];
      const firstPurchase = filteredPurchases.find(s => s.id === firstId);
      const hasDifferentSupplier = selectedPurchases.some(id => filteredPurchases.find(x => x.id === id)?.contactId !== firstPurchase.contactId);

      if (hasDifferentSupplier) {
          toast({ variant: 'destructive', title: "Error de Validación", description: "Selecciona compras de un mismo proveedor." });
          return;
      }
      setIsGeneratePurchaseModalOpen(true);
  };

  const handleGeneratePurchaseInvoice = () => {
      const purchasesToInvoice = filteredPurchases.filter(s => selectedPurchases.includes(s.id));
      if (purchasesToInvoice.length === 0) return;

      const firstPurchase = purchasesToInvoice[0];
      const supplier = contacts?.find(c => c.id === firstPurchase.contactId);
      const totalAmount = purchasesToInvoice.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
      
      const dates = purchasesToInvoice.map(s => new Date(s.date));
      const minDate = new Date(Math.min.apply(null, dates));
      const maxDate = new Date(Math.max.apply(null, dates));
      const dateRangeStr = `${format(minDate, 'dd/MM/yyyy')} - ${format(maxDate, 'dd/MM/yyyy')}`;

      // CORRECCIÓN: Consecutivo seguro buscando el número más alto emitido
      const maxPurNum = (purchaseInvoices || []).reduce((max, inv) => {
          const match = inv.invoiceNumber?.match(/\d+$/);
          const num = match ? parseInt(match[0], 10) : 0;
          return num > max ? num : max;
      }, 0);
      const invoiceNum = `FAC-COM-${String(maxPurNum + 1).padStart(4, '0')}`;

      const newInvoice = {
          id: `pur-inv-${Date.now()}`,
          type: 'purchase',
          sourceType: 'purchase',
          invoiceNumber: invoiceNum,
          createdAt: new Date().toISOString(),
          supplierData: supplier || { name: 'Proveedor Desconocido', id: firstPurchase.contactId },
          items: purchasesToInvoice,
          total: totalAmount,
          status: 'issued',
          dateRange: dateRangeStr
      };

      savePurchaseInvoices([...(purchaseInvoices || []), newInvoice]);
      setSelectedPurchases([]);
      setIsGeneratePurchaseModalOpen(false);
      toast({ title: "Factura de Compra Creada", description: `Documento ${invoiceNum} registrado exitosamente.` });
      setActivePurchaseTab('history');
  };

  // ================= SHARED ACTIONS =================
  const openInvoiceDetail = (invoice) => {
      setViewInvoice(invoice);
      setIsDetailModalOpen(true);
  };

  const confirmDelete = (invoice) => {
      setInvoiceToDelete(invoice);
      setIsDeleteDialogOpen(true);
  };

  const executeDelete = () => {
      if (!invoiceToDelete) return;

      if (['purchase', 'expense'].includes(invoiceToDelete.type)) {
          const updated = (purchaseInvoices || []).filter(inv => inv.id !== invoiceToDelete.id);
          savePurchaseInvoices(updated);
      } else {
          const updated = (invoices || []).filter(inv => inv.id !== invoiceToDelete.id);
          saveInvoices(updated);
      }

      toast({ 
          title: "Documento eliminado", 
          description: "El registro de factura ha sido eliminado. Las transacciones originales permanecen intactas." 
      });

      setIsDeleteDialogOpen(false);
      setInvoiceToDelete(null);
  };

  return (
    <>
      <Helmet><title>Facturación - JaiderHerTur26</title></Helmet>
      
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Facturación y Compras</h1>
            <p className="text-slate-600">Gestiona facturas de venta y documentos de compra.</p>
          </div>
        </div>

        <Tabs value={mainTab} onValueChange={setMainTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8 bg-slate-100 p-1 rounded-xl">
                <TabsTrigger value="sales" className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm text-base py-3">
                    <ShoppingCart className="w-4 h-4 mr-2"/> Facturas de Venta
                </TabsTrigger>
                <TabsTrigger value="purchases" className="data-[state=active]:bg-white data-[state=active]:text-orange-600 data-[state=active]:shadow-sm text-base py-3">
                    <ShoppingBag className="w-4 h-4 mr-2"/> Facturas de Compra
                </TabsTrigger>
            </TabsList>

            {/* ===================== SALES TAB CONTENT ===================== */}
            <TabsContent value="sales" className="space-y-6">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
                        <TabsTrigger value="generate">Generar Facturas</TabsTrigger>
                        <TabsTrigger value="history">Historial Facturas</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="generate" className="space-y-6 mt-6">
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex items-center gap-2 mb-4 text-blue-800 font-semibold">
                                <Filter className="w-4 h-4" />
                                <h3>Filtrar Ventas Pendientes</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                                <div className="space-y-1 lg:col-span-2">
                                    <Label>Cliente</Label>
                                    <ContactSelector contacts={contacts} value={filterContactId} onChange={setFilterContactId} />
                                </div>
                                <div className="space-y-1">
                                    <Label>Desde</Label>
                                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-slate-50 border-slate-200" />
                                </div>
                                <div className="space-y-1">
                                    <Label>Hasta</Label>
                                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-slate-50 border-slate-200" />
                                </div>
                            </div>
                        </motion.div>

                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                            <div className="p-4 border-b flex justify-between items-center bg-blue-50/30">
                                <div className="text-sm text-slate-500">Mostrando {filteredSales.length} ventas encontradas</div>
                                <Button onClick={handleOpenGenerateModal} disabled={selectedSales.length === 0} className="bg-blue-600 hover:bg-blue-700">
                                    <FileText className="w-4 h-4 mr-2" /> Generar Factura ({selectedSales.length})
                                </Button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-white text-slate-600 font-semibold border-b">
                                        <tr>
                                            <th className="px-4 py-3 w-10"><button onClick={toggleSelectAllSales} className="flex items-center text-slate-400 hover:text-slate-600">{filteredSales.length > 0 && selectedSales.length === filteredSales.length ? <CheckSquare className="w-5 h-5 text-blue-600"/> : <Square className="w-5 h-5"/>}</button></th>
                                            <th className="px-4 py-3">Fecha</th>
                                            <th className="px-4 py-3">Cliente</th>
                                            <th className="px-4 py-3">Producto</th>
                                            <th className="px-4 py-3 text-center">Cant.</th>
                                            <th className="px-4 py-3 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredSales.length === 0 ? (
                                            <tr><td colSpan="6" className="text-center py-12 text-slate-400">No se encontraron ventas pendientes.</td></tr>
                                        ) : (
                                            filteredSales.map(sale => {
                                                const isSelected = selectedSales.includes(sale.id);
                                                const contactName = contacts?.find(c => c.id === sale.contactId)?.name || 'Desconocido';
                                                return (
                                                    <tr key={sale.id} className={`hover:bg-blue-50/50 ${isSelected ? 'bg-blue-50' : ''}`}>
                                                        <td className="px-4 py-3"><button onClick={() => toggleSaleSelection(sale.id)} className="flex items-center">{isSelected ? <CheckSquare className="w-5 h-5 text-blue-600"/> : <Square className="w-5 h-5 text-slate-300 hover:text-slate-500"/>}</button></td>
                                                        <td className="px-4 py-3 text-slate-600">{format(parseISO(sale.date), 'dd/MM/yyyy')}</td>
                                                        <td className="px-4 py-3 font-medium text-slate-700">{contactName}</td>
                                                        <td className="px-4 py-3 text-slate-700">{sale.productName || sale.description}</td>
                                                        <td className="px-4 py-3 text-center text-slate-600">{sale.productQuantity}</td>
                                                        <td className="px-4 py-3 text-right font-bold font-mono text-slate-800">${parseFloat(sale.amount).toLocaleString('es-CO')}</td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    </TabsContent>

                    <TabsContent value="history" className="mt-6">
                        <div className="mb-4 flex justify-end">
                            <Select value={salesTypeFilter} onValueChange={setSalesTypeFilter}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Tipo de Documento" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos</SelectItem>
                                    <SelectItem value="sale">Facturas Venta</SelectItem>
                                    <SelectItem value="income">Notas Ingreso</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                                        <tr>
                                            <th className="px-6 py-4">Nº Documento</th>
                                            <th className="px-6 py-4">Fecha</th>
                                            <th className="px-6 py-4">Cliente</th>
                                            <th className="px-6 py-4">Origen</th>
                                            <th className="px-6 py-4 text-right">Total</th>
                                            <th className="px-6 py-4 text-center">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredHistorySales.length === 0 ? (
                                            <tr><td colSpan="6" className="text-center py-12 text-slate-400">No hay documentos generados.</td></tr>
                                        ) : (
                                            filteredHistorySales.map(inv => (
                                                <tr key={inv.id} className="hover:bg-slate-50">
                                                    <td className="px-6 py-4 font-bold text-blue-600">{inv.invoiceNumber}</td>
                                                    <td className="px-6 py-4 text-slate-600">{format(new Date(inv.createdAt), 'dd/MM/yyyy')}</td>
                                                    <td className="px-6 py-4 font-medium text-slate-700">{inv.clientData?.name}</td>
                                                    <td className="px-6 py-4">
                                                        {inv.sourceType === 'transaction' ? (
                                                            <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">Transacción</Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="text-slate-500">Venta Directa</Badge>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-mono font-bold text-slate-800">${parseFloat(inv.total).toLocaleString('es-CO')}</td>
                                                    <td className="px-6 py-4 text-center flex justify-center gap-2">
                                                        <Button variant="outline" size="sm" onClick={() => openInvoiceDetail(inv)} className="text-blue-600"><Eye className="w-4 h-4 mr-2" /> Ver</Button>
                                                        <Button variant="outline" size="sm" onClick={() => confirmDelete(inv)} className="text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4 mr-2" /> Eliminar</Button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    </TabsContent>
                </Tabs>
            </TabsContent>

            {/* ===================== PURCHASES TAB CONTENT ===================== */}
            <TabsContent value="purchases" className="space-y-6">
                <Tabs value={activePurchaseTab} onValueChange={setActivePurchaseTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
                        <TabsTrigger value="generate">Generar Doc. Compra</TabsTrigger>
                        <TabsTrigger value="history">Historial Compras</TabsTrigger>
                    </TabsList>

                    <TabsContent value="generate" className="space-y-6 mt-6">
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex items-center gap-2 mb-4 text-orange-800 font-semibold">
                                <Filter className="w-4 h-4" />
                                <h3>Filtrar Compras Pendientes</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                                <div className="space-y-1 lg:col-span-2">
                                    <Label>Proveedor</Label>
                                    <ContactSelector contacts={contacts} value={filterSupplierId} onChange={setFilterSupplierId} />
                                </div>
                                <div className="space-y-1">
                                    <Label>Desde</Label>
                                    <input type="date" value={dateFromPurchase} onChange={e => setDateFromPurchase(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-slate-50 border-slate-200" />
                                </div>
                                <div className="space-y-1">
                                    <Label>Hasta</Label>
                                    <input type="date" value={dateToPurchase} onChange={e => setDateToPurchase(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-slate-50 border-slate-200" />
                                </div>
                            </div>
                        </motion.div>

                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                            <div className="p-4 border-b flex justify-between items-center bg-orange-50/30">
                                <div className="text-sm text-slate-500">Mostrando {filteredPurchases.length} compras encontradas</div>
                                <Button onClick={handleOpenGeneratePurchaseModal} disabled={selectedPurchases.length === 0} className="bg-orange-600 hover:bg-orange-700">
                                    <FileText className="w-4 h-4 mr-2" /> Generar Documento ({selectedPurchases.length})
                                </Button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-white text-slate-600 font-semibold border-b">
                                        <tr>
                                            <th className="px-4 py-3 w-10"><button onClick={toggleSelectAllPurchases} className="flex items-center text-slate-400 hover:text-slate-600">{filteredPurchases.length > 0 && selectedPurchases.length === filteredPurchases.length ? <CheckSquare className="w-5 h-5 text-orange-600"/> : <Square className="w-5 h-5"/>}</button></th>
                                            <th className="px-4 py-3">Fecha</th>
                                            <th className="px-4 py-3">Proveedor</th>
                                            <th className="px-4 py-3">Producto / Insumo</th>
                                            <th className="px-4 py-3 text-center">Cant.</th>
                                            <th className="px-4 py-3 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredPurchases.length === 0 ? (
                                            <tr><td colSpan="6" className="text-center py-12 text-slate-400">No se encontraron compras pendientes.</td></tr>
                                        ) : (
                                            filteredPurchases.map(pur => {
                                                const isSelected = selectedPurchases.includes(pur.id);
                                                const contactName = contacts?.find(c => c.id === pur.contactId)?.name || 'Desconocido';
                                                return (
                                                    <tr key={pur.id} className={`hover:bg-orange-50/50 ${isSelected ? 'bg-orange-50' : ''}`}>
                                                        <td className="px-4 py-3"><button onClick={() => togglePurchaseSelection(pur.id)} className="flex items-center">{isSelected ? <CheckSquare className="w-5 h-5 text-orange-600"/> : <Square className="w-5 h-5 text-slate-300 hover:text-slate-500"/>}</button></td>
                                                        <td className="px-4 py-3 text-slate-600">{format(parseISO(pur.date), 'dd/MM/yyyy')}</td>
                                                        <td className="px-4 py-3 font-medium text-slate-700">{contactName}</td>
                                                        <td className="px-4 py-3 text-slate-700">{pur.productName || pur.description}</td>
                                                        <td className="px-4 py-3 text-center text-slate-600">{pur.productQuantity}</td>
                                                        <td className="px-4 py-3 text-right font-bold font-mono text-slate-800">${parseFloat(pur.amount).toLocaleString('es-CO')}</td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    </TabsContent>

                    <TabsContent value="history" className="mt-6">
                        <div className="mb-4 flex justify-end">
                            <Select value={purchasesTypeFilter} onValueChange={setPurchasesTypeFilter}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Tipo de Documento" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos</SelectItem>
                                    <SelectItem value="purchase">Facturas Compra</SelectItem>
                                    <SelectItem value="expense">Soportes Gasto</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                                        <tr>
                                            <th className="px-6 py-4">ID Interno</th>
                                            <th className="px-6 py-4">Fecha</th>
                                            <th className="px-6 py-4">Proveedor</th>
                                            <th className="px-6 py-4">Origen</th>
                                            <th className="px-6 py-4 text-right">Total</th>
                                            <th className="px-6 py-4 text-center">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredHistoryPurchases.length === 0 ? (
                                            <tr><td colSpan="6" className="text-center py-12 text-slate-400">No hay documentos de compra generados.</td></tr>
                                        ) : (
                                            filteredHistoryPurchases.map(inv => (
                                                <tr key={inv.id} className="hover:bg-slate-50">
                                                    <td className="px-6 py-4 font-bold text-orange-600">{inv.invoiceNumber}</td>
                                                    <td className="px-6 py-4 text-slate-600">{format(new Date(inv.createdAt), 'dd/MM/yyyy')}</td>
                                                    <td className="px-6 py-4 font-medium text-slate-700">{inv.supplierData?.name}</td>
                                                    <td className="px-6 py-4">
                                                        {inv.sourceType === 'transaction' ? (
                                                            <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">Transacción</Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="text-slate-500">Compra Directa</Badge>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-mono font-bold text-slate-800">${parseFloat(inv.total).toLocaleString('es-CO')}</td>
                                                    <td className="px-6 py-4 text-center flex justify-center gap-2">
                                                        <Button variant="outline" size="sm" onClick={() => openInvoiceDetail(inv)} className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"><Eye className="w-4 h-4 mr-2" /> Ver</Button>
                                                        <Button variant="outline" size="sm" onClick={() => confirmDelete(inv)} className="text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4 mr-2" /> Eliminar</Button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    </TabsContent>
                </Tabs>
            </TabsContent>

        </Tabs>
      </div>

      {/* GENERATE SALES INVOICE MODAL */}
      <Dialog open={isGenerateModalOpen} onOpenChange={setIsGenerateModalOpen}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Confirmar Factura de Venta</DialogTitle>
                    <DialogDescription>Agrupando ventas para el cliente seleccionado.</DialogDescription>
                </DialogHeader>
                {selectedSales.length > 0 && (
                    <div className="py-4 space-y-4">
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                            <h4 className="font-semibold text-sm mb-1 text-blue-500 uppercase">Cliente</h4>
                            <p className="text-lg font-bold text-slate-800">{contacts?.find(c => c.id === filteredSales.find(s => s.id === selectedSales[0])?.contactId)?.name}</p>
                        </div>
                        <div className="border rounded-lg overflow-hidden">
                            <div className="bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-500 flex justify-between"><span>ITEMS ({selectedSales.length})</span><span>SUBTOTAL</span></div>
                            <div className="max-h-[200px] overflow-y-auto p-2 space-y-2">
                                {filteredSales.filter(s => selectedSales.includes(s.id)).map(s => (
                                    <div key={s.id} className="flex justify-between text-sm px-2"><span className="truncate max-w-[300px]">{s.productName || s.description}</span><span className="font-mono">${parseFloat(s.amount).toLocaleString('es-CO')}</span></div>
                                ))}
                            </div>
                            <div className="bg-blue-100 px-4 py-3 flex justify-between font-bold border-t text-blue-900"><span>TOTAL</span><span>${filteredSales.filter(s => selectedSales.includes(s.id)).reduce((sum, s) => sum + parseFloat(s.amount), 0).toLocaleString('es-CO')}</span></div>
                        </div>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsGenerateModalOpen(false)}>Cancelar</Button>
                    <Button onClick={handleGenerateInvoice} className="bg-blue-600 hover:bg-blue-700">Generar Factura</Button>
                </DialogFooter>
            </DialogContent>
      </Dialog>

      {/* GENERATE PURCHASE INVOICE MODAL */}
      <Dialog open={isGeneratePurchaseModalOpen} onOpenChange={setIsGeneratePurchaseModalOpen}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Confirmar Documento de Compra</DialogTitle>
                    <DialogDescription>Agrupando compras del proveedor seleccionado.</DialogDescription>
                </DialogHeader>
                {selectedPurchases.length > 0 && (
                    <div className="py-4 space-y-4">
                        <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
                            <h4 className="font-semibold text-sm mb-1 text-orange-500 uppercase">Proveedor</h4>
                            <p className="text-lg font-bold text-slate-800">{contacts?.find(c => c.id === filteredPurchases.find(s => s.id === selectedPurchases[0])?.contactId)?.name}</p>
                        </div>
                        <div className="border rounded-lg overflow-hidden">
                            <div className="bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-500 flex justify-between"><span>ITEMS ({selectedPurchases.length})</span><span>SUBTOTAL</span></div>
                            <div className="max-h-[200px] overflow-y-auto p-2 space-y-2">
                                {filteredPurchases.filter(s => selectedPurchases.includes(s.id)).map(s => (
                                    <div key={s.id} className="flex justify-between text-sm px-2"><span className="truncate max-w-[300px]">{s.productName || s.description}</span><span className="font-mono">${parseFloat(s.amount).toLocaleString('es-CO')}</span></div>
                                ))}
                            </div>
                            <div className="bg-orange-100 px-4 py-3 flex justify-between font-bold border-t text-orange-900"><span>TOTAL</span><span>${filteredPurchases.filter(s => selectedPurchases.includes(s.id)).reduce((sum, s) => sum + parseFloat(s.amount), 0).toLocaleString('es-CO')}</span></div>
                        </div>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsGeneratePurchaseModalOpen(false)}>Cancelar</Button>
                    <Button onClick={handleGeneratePurchaseInvoice} className="bg-orange-600 hover:bg-orange-700">Generar Documento</Button>
                </DialogFooter>
            </DialogContent>
      </Dialog>

      {/* DELETE MODAL */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle className="text-red-600">Eliminar Documento</DialogTitle>
                    <DialogDescription>
                        ¿Eliminar {invoiceToDelete?.invoiceNumber}?
                        <br/><br/>
                        <span className="text-xs bg-amber-50 text-amber-800 p-2 rounded block border border-amber-200">
                            Nota: Esta acción solo elimina el documento agrupado. Las transacciones originales NO se eliminan.
                        </span>
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancelar</Button>
                    <Button variant="destructive" onClick={executeDelete}>Eliminar</Button>
                </DialogFooter>
            </DialogContent>
      </Dialog>

      {/* DETAIL MODAL */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
            <DialogContent className="max-w-[850px] max-h-[90vh] overflow-y-auto">
                {viewInvoice && (
                    <InvoiceDetail invoice={viewInvoice} company={activeCompany} />
                )}
            </DialogContent>
      </Dialog>
    </>
  );
};

export default Invoices;