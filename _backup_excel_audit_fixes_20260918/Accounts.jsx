import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, Search, Edit2, Trash2, BookOpen, Download, Upload, Lock, ChevronRight, ChevronDown, Folder, FileText, FolderOpen, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { exportToExcel } from '@/lib/excel';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

// Standard accounting classes definition
const ACCOUNT_CLASSES = {
  1: { name: 'Activo', color: 'text-blue-600', bg: 'bg-blue-50' },
  2: { name: 'Pasivo', color: 'text-red-600', bg: 'bg-red-50' },
  3: { name: 'Patrimonio', color: 'text-purple-600', bg: 'bg-purple-50' },
  4: { name: 'Ingresos', color: 'text-green-600', bg: 'bg-green-50' },
  5: { name: 'Gastos', color: 'text-orange-600', bg: 'bg-orange-50' },
  6: { name: 'Costos de Venta', color: 'text-amber-600', bg: 'bg-amber-50' },
  7: { name: 'Costos de Producción', color: 'text-indigo-600', bg: 'bg-indigo-50' },
  8: { name: 'Cuentas de Orden Deudoras', color: 'text-slate-600', bg: 'bg-slate-50' },
  9: { name: 'Cuentas de Orden Acreedoras', color: 'text-slate-600', bg: 'bg-slate-50' },
};

// Standard hierarchy levels
const HIERARCHY_LEVELS = [1, 2, 4, 6, 8, 10, 12, 14];

const getLevelInfo = (code) => {
  const len = code.toString().length;
  if (len === 1) return { level: 0, label: 'Clase', indent: 0 };
  if (len === 2) return { level: 1, label: 'Grupo', indent: 1 };
  if (len === 4) return { level: 2, label: 'Cuenta', indent: 2 };
  if (len >= 6) {
    const extraSteps = Math.floor((len - 6) / 2);
    return { level: 3 + extraSteps, label: len === 6 ? 'Subcuenta' : 'Auxiliar', indent: 3 + extraSteps };
  }
  return { level: 0, label: 'Desconocido', indent: 0 };
};

const Accounts = () => {
  const { canEdit, canDelete, canAdd, canImport, isReadOnly } = usePermission();
  const [accounts, saveAccounts] = useCompanyData('accounts');
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (Object.keys(expandedGroups).length === 0 && accounts && accounts.length > 0) {
      const initialExpanded = {};
      accounts.forEach(acc => {
        if (acc.number.length <= 2) {
          initialExpanded[acc.number] = true;
        }
      });
      setExpandedGroups(initialExpanded);
    }
  }, [accounts]);

  const toggleExpand = (code) => {
    setExpandedGroups(prev => ({ ...prev, [code]: !prev[code] }));
  };

  const processedAccounts = useMemo(() => {
    let result = [...(accounts || [])];
    result.sort((a, b) => a.number.localeCompare(b.number));
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(a => a.name.toLowerCase().includes(lowerTerm) || a.number.includes(lowerTerm));
    }
    return result;
  }, [accounts, searchTerm]);

  const getVisibleRows = () => {
    if (searchTerm) return processedAccounts;
    const visible = [];
    const codesWithChildren = new Set();

    processedAccounts.forEach(acc => {
        const hasChild = processedAccounts.some(child => child.number.startsWith(acc.number) && child.number !== acc.number);
        if (hasChild) codesWithChildren.add(acc.number);
    });

    processedAccounts.forEach(acc => {
        let isVisible = true;
        for (let len of HIERARCHY_LEVELS) {
            if (acc.number.length > len) {
                const parentCode = acc.number.substring(0, len);
                if (codesWithChildren.has(parentCode) && !expandedGroups[parentCode]) {
                    isVisible = false;
                    break; 
                }
            } else break;
        }
        if (isVisible) {
            visible.push({ ...acc, hasChildren: codesWithChildren.has(acc.number), isExpanded: !!expandedGroups[acc.number] });
        }
    });
    return visible;
  };

  const displayRows = getVisibleRows();

  const handleSaveAccount = (accountData) => {
    if (!canAdd && !editingAccount) return;
    if (!canEdit && editingAccount) return;

    const len = accountData.number.length;
    if (!HIERARCHY_LEVELS.includes(len)) {
       toast({ variant: "destructive", title: "Código inválido", description: `Longitud (${len}) no válida.` });
       return;
    }
    
    const isDuplicate = accounts.some(a => a.number === accountData.number && a.id !== accountData.id);
    if (isDuplicate) {
        toast({ variant: "destructive", title: "Código duplicado", description: "Ya existe una cuenta con este código." });
        return;
    }

    let updatedAccounts;
    if (editingAccount) {
      updatedAccounts = accounts.map(a => a.id === editingAccount.id ? accountData : a);
    } else {
      updatedAccounts = [...accounts, { ...accountData, id: crypto.randomUUID() }];
    }
    
    // Auto-expand parents
    const newExpansions = {};
    for (let levelLen of HIERARCHY_LEVELS) {
        if (len > levelLen) {
            const parentCode = accountData.number.substring(0, levelLen);
            newExpansions[parentCode] = true;
        }
    }
    if (Object.keys(newExpansions).length > 0) {
        setExpandedGroups(prev => ({ ...prev, ...newExpansions }));
    }

    saveAccounts(updatedAccounts);
    setDialogOpen(false);
    setEditingAccount(null);
    toast({ title: editingAccount ? "Cuenta actualizada" : "Cuenta creada" });
  };

  const handleDeleteAccount = (id) => {
    if (!canDelete) return;
    const accToDelete = accounts.find(a => a.id === id);
    const hasChildren = accounts.some(a => a.number.startsWith(accToDelete.number) && a.id !== id);
    if (hasChildren) {
        toast({ variant: "destructive", title: "Error", description: "Elimine las subcuentas primero." });
        return;
    }
    saveAccounts(accounts.filter(a => a.id !== id));
    toast({ title: "Cuenta eliminada" });
  };
  
  const handleExport = () => {
    if (accounts.length === 0) return;
    const dataToExport = accounts.map(c => ({ 'Código': c.number, 'Nombre': c.name, 'Nivel': getLevelInfo(c.number).label }));
    exportToExcel(dataToExport, 'Plan_de_Cuentas');
  };
  
  const handleImport = (event) => {
    if (!canImport) return;
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

          if (jsonData.length === 0) {
             toast({ variant: 'destructive', title: "Error", description: "El archivo Excel está vacío." });
             return;
          }

          // Normalize keys helper
          const normalize = (key) => key ? key.toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
          
          const headers = Object.keys(jsonData[0]);
          const normalizedHeaders = headers.map(normalize);
          
          const hasCode = normalizedHeaders.some(h => h.includes('codigo') || h === 'code' || h === 'numero');
          const hasName = normalizedHeaders.some(h => h.includes('nombre') || h === 'name' || h === 'descripcion');
          
          if (!hasCode || !hasName) {
               toast({ variant: 'destructive', title: "Estructura Inválida", description: "El archivo debe contener columnas 'Código' y 'Nombre'." });
               return;
          }

          // Optional validation for 'Tipo' and 'Saldo' - we warn but don't block to maintain backward compatibility with the app's own exports
          const hasType = normalizedHeaders.some(h => h.includes('tipo') || h === 'type' || h.includes('nivel') || h === 'class');
          const hasBalance = normalizedHeaders.some(h => h.includes('saldo') || h === 'balance');
          
          if (!hasType || !hasBalance) {
               // We won't block, but we can log it. The primary requirement is Code/Name for the structure.
               // toast({ title: "Nota de Importación", description: "Algunos campos opcionales (Tipo, Saldo) no se encontraron, pero se importará la estructura." });
          }

          const newAccounts = [];
          const existingNumbers = new Set(accounts.map(a => a.number));
          let skipped = 0;
          let importedCount = 0;

          jsonData.forEach(row => {
              let code, name;
              // Extract values based on loose matching of headers
              Object.keys(row).forEach(key => {
                  const normKey = normalize(key);
                  if (normKey.includes('codigo') || normKey === 'code' || normKey === 'numero') code = row[key];
                  if (normKey.includes('nombre') || normKey === 'name' || normKey === 'descripcion') name = row[key];
              });

              if (code && name) {
                  const numStr = String(code).trim();
                  const nameStr = String(name).trim();

                  if (numStr && nameStr) {
                      if (!existingNumbers.has(numStr)) {
                          newAccounts.push({ id: crypto.randomUUID(), number: numStr, name: nameStr });
                          existingNumbers.add(numStr);
                          importedCount++;
                      } else {
                          skipped++;
                      }
                  }
              }
          });

          if (newAccounts.length > 0) {
              saveAccounts([...accounts, ...newAccounts]);
              toast({ title: "Importación Exitosa", description: `Se agregaron ${importedCount} cuentas. ${skipped} ya existían.` });
          } else {
              toast({ title: "Sin Cambios", description: "No se encontraron cuentas nuevas válidas." });
          }

        } catch (error) {
          console.error(error);
          toast({ variant: 'destructive', title: "Error de Lectura", description: "No se pudo procesar el archivo Excel. Verifique el formato." });
        }
      };
      reader.readAsArrayBuffer(file);
      fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <Helmet>
        <title>Plan de Cuentas - JaiderHerTur26</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-4xl font-bold text-slate-900">Plan de Cuentas</h1>
            <p className="text-slate-600">Estructura contable jerárquica</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Button onClick={handleExport} variant="outline" size="sm"><Download className="w-4 h-4 mr-2" />Exportar</Button>
            {canImport && <Button asChild variant="outline" size="sm"><label className="cursor-pointer"><Upload className="w-4 h-4 mr-2" />Cargar Excel<input type="file" ref={fileInputRef} accept=".xlsx" onChange={handleImport} className="hidden" /></label></Button>}
            {canAdd && <Button onClick={() => { setEditingAccount(null); setDialogOpen(true); }} className="bg-blue-600 hover:bg-blue-700" size="sm"><Plus className="w-4 h-4 mr-2" />Nueva Cuenta</Button>}
            {isReadOnly && <div className="flex items-center text-slate-400 text-xs ml-2 bg-slate-100 px-2 py-1 rounded"><Lock className="w-3 h-3 mr-1"/> Lectura</div>}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input type="text" placeholder="Buscar cuenta..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <div className="col-span-6 sm:col-span-4">Código / Cuenta</div>
                <div className="col-span-3 sm:col-span-6">Nombre</div>
                <div className="col-span-3 sm:col-span-2 text-right">Nivel</div>
            </div>
            <div className="divide-y divide-slate-100 overflow-y-auto max-h-[70vh] custom-scrollbar">
               {displayRows.length === 0 ? (
                   <div className="p-12 text-center text-slate-400"><BookOpen className="w-12 h-12 mx-auto mb-3 opacity-20"/><p>No se encontraron cuentas</p></div>
               ) : (
                   displayRows.map((row) => {
                       const { level, label, indent } = getLevelInfo(row.number);
                       let rowBg = 'bg-white';
                       let textClass = 'text-slate-600';
                       let icon = <FileText className="w-4 h-4 text-slate-300" />;

                       if (level === 0) {
                           rowBg = 'bg-slate-50/80';
                           textClass = 'font-bold text-slate-800';
                           icon = <FolderOpen className="w-4 h-4 text-slate-400" />;
                           if (ACCOUNT_CLASSES[row.number[0]]) textClass = cn('font-bold', ACCOUNT_CLASSES[row.number[0]].color);
                       } else if (level === 1) {
                           textClass = 'font-semibold text-slate-700';
                           icon = <Folder className="w-4 h-4 text-blue-300" />;
                       }

                       return (
                           <motion.div layout="position" key={row.id} className={cn("grid grid-cols-12 gap-4 px-6 py-2.5 items-center hover:bg-slate-50 transition-colors group text-sm", rowBg)}>
                               <div className="col-span-6 sm:col-span-4 flex items-center gap-2" style={{ paddingLeft: `${indent * 1.5}rem` }}>
                                   {row.hasChildren ? <button onClick={() => toggleExpand(row.number)} className="p-0.5 rounded hover:bg-slate-200 text-slate-400">{row.isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</button> : <span className="w-5" />}
                                   <span className={cn("font-mono", textClass)}>{row.number}</span>
                               </div>
                               <div className="col-span-3 sm:col-span-6 flex items-center gap-2 overflow-hidden">{icon}<span className={cn("truncate", textClass)}>{row.name}</span></div>
                               <div className="col-span-3 sm:col-span-2 flex items-center justify-end gap-3">
                                   <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-500 font-medium uppercase border border-slate-200">{label}</span>
                                   <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                                        {canEdit && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingAccount(row); setDialogOpen(true); }}><Edit2 className="w-3 h-3 text-blue-500" /></Button>}
                                        {canDelete && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteAccount(row.id)}><Trash2 className="w-3 h-3 text-red-500" /></Button>}
                                   </div>
                               </div>
                           </motion.div>
                       );
                   })
               )}
            </div>
        </div>
      </div>
      <AccountDialog open={dialogOpen} onOpenChange={setDialogOpen} account={editingAccount} onSave={handleSaveAccount} />
    </>
  );
};

const AccountDialog = ({ open, onOpenChange, account, onSave }) => {
  const [formData, setFormData] = useState({ number: '', name: '' });
  const [levelPreview, setLevelPreview] = useState(null);

  useEffect(() => { setFormData(account ? { ...account } : { number: '', name: '', id: null }); }, [account, open]);
  useEffect(() => { setLevelPreview(formData.number ? getLevelInfo(formData.number) : null); }, [formData.number]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{account ? 'Editar Cuenta' : 'Nueva Cuenta'}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="number">Código (PUC)</Label>
            <div className="relative">
                <input id="number" required value={formData.number} onChange={(e) => setFormData({...formData, number: e.target.value.replace(/[^0-9]/g, '')})} className={cn("w-full pl-3 pr-24 py-2 border rounded-lg font-mono text-lg tracking-wider focus:ring-2 focus:ring-blue-500 outline-none transition-all", !levelPreview ? "border-slate-300" : "border-blue-300 bg-blue-50/30")} placeholder="Ej: 110505" />
                {levelPreview && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-md uppercase">{levelPreview.label}</span>}
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Estructura: 1, 2, 4, 6, 8, 10...</p>
          </div>
          <div className="space-y-2"><Label htmlFor="name">Nombre</Label><input id="name" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ej: CAJA GENERAL" /></div>
          <DialogFooter className="pt-4"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" className="bg-blue-600 hover:bg-blue-700">Guardar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default Accounts;