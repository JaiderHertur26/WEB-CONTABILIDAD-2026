import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, Search, Edit2, Trash2, User, Building, Download, Lock, Upload, Briefcase, Truck, CreditCard, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { exportToExcel } from '@/lib/excel';
import { usePermission } from '@/hooks/usePermission';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from '@/lib/utils';

const CATEGORIES = {
  CLIENTE: { label: 'Cliente', color: 'bg-blue-100 text-blue-800', icon: User },
  PROVEEDOR: { label: 'Proveedor', color: 'bg-green-100 text-green-800', icon: Truck },
  ACREEDOR: { label: 'Acreedor', color: 'bg-orange-100 text-orange-800', icon: CreditCard }
};

const Contacts = () => {
  const { canEdit, canDelete, canAdd, isReadOnly } = usePermission();
  const [contacts, saveContacts] = useCompanyData('contacts');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  const handleSaveContact = (contact) => {
    if (!canAdd && !editingContact) return;
    if (!canEdit && editingContact) return;

    let updatedContacts;
    if (editingContact) {
      updatedContacts = contacts.map(c => c.id === editingContact.id ? contact : c);
      toast({ title: "¡Contacto actualizado!", description: "Los cambios se guardaron correctamente." });
    } else {
      updatedContacts = [...contacts, { ...contact, id: Date.now().toString() }];
      toast({ title: "¡Contacto creado!", description: "El nuevo contacto se ha guardado." });
    }
    saveContacts(updatedContacts);
    setDialogOpen(false);
    setEditingContact(null);
  };

  const handleDeleteContact = (id) => {
    if (!canDelete) return;
    const updatedContacts = contacts.filter(c => c.id !== id);
    saveContacts(updatedContacts);
    toast({ title: "Contacto eliminado", description: "El contacto fue eliminado." });
  };

  const openDialogForEdit = (contact) => {
    if (!canEdit) return;
    setEditingContact(contact);
    setDialogOpen(true);
  };

  const openDialogForNew = () => {
    if (!canAdd) return;
    setEditingContact(null);
    setDialogOpen(true);
  };

  const handleExport = () => {
    if (contacts.length === 0) {
      toast({ variant: 'destructive', title: "No hay contactos para exportar" });
      return;
    }
    const dataToExport = contacts.map(c => ({
      'Nombre': c.name,
      'Categoría': c.category || 'Cliente',
      'Email': c.email,
      'Teléfono': c.phone,
      'Dirección': c.address,
      'Tipo': c.type === 'person' ? 'Persona' : 'Empresa',
      'Tipo Documento': c.docType,
      'Número Documento': c.docNumber
    }));
    exportToExcel(dataToExport, 'Contactos');
    toast({ title: "¡Exportado!", description: "Tus contactos han sido exportados a Excel." });
  };

  const triggerImport = () => {
      if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleImportFile = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              let parsedData = [];
              const text = event.target.result;

              if (file.name.endsWith('.json')) {
                  parsedData = JSON.parse(text);
              } else if (file.name.endsWith('.csv')) {
                  const rows = text.split('\n');
                  const headers = rows[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
                  parsedData = rows.slice(1).filter(r => r.trim()).map(row => {
                      const values = row.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                      const obj = {};
                      headers.forEach((header, i) => obj[header] = values[i]);
                      return obj;
                  });
              } else {
                   toast({ variant: 'destructive', title: "Formato no soportado", description: "Por favor usa archivos JSON o CSV." });
                   return;
              }

              let addedCount = 0;
              let skippedCount = 0;
              const newContacts = [...contacts];
              const existingKeys = new Set(contacts.map(c => `${c.docType}-${c.docNumber}`));

              if (!Array.isArray(parsedData)) throw new Error("Formato de datos inválido");

              parsedData.forEach(item => {
                  const name = item.name || item.Nombre || item.nombre;
                  const docType = item.docType || item['Tipo Documento'] || 'CC';
                  const docNumber = item.docNumber || item['Número Documento'] || item.doc_number;
                  // Default imported contacts to 'Cliente' if not specified
                  const category = item.category || item.Categoría || 'Cliente';
                  
                  if (!name || !docNumber) {
                      skippedCount++;
                      return;
                  }

                  const key = `${docType}-${docNumber}`;
                  if (!existingKeys.has(key)) {
                      newContacts.push({
                          id: `imp-${Date.now()}-${Math.random()}`,
                          name,
                          docType,
                          docNumber,
                          category,
                          type: item.type || item.Tipo || 'person',
                          email: item.email || item.Email || '',
                          phone: item.phone || item.Teléfono || '',
                          address: item.address || item.Dirección || ''
                      });
                      existingKeys.add(key);
                      addedCount++;
                  } else {
                      skippedCount++;
                  }
              });

              if (addedCount > 0) {
                  saveContacts(newContacts);
                  toast({ title: "Importación exitosa", description: `${addedCount} contactos importados. ${skippedCount} duplicados/inválidos omitidos.` });
              } else {
                  toast({ variant: "warning", title: "Sin cambios", description: "No se importaron contactos nuevos (posibles duplicados)." });
              }

          } catch (error) {
              console.error(error);
              toast({ variant: 'destructive', title: "Error al importar", description: "No se pudo procesar el archivo. Verifique el formato." });
          }
          e.target.value = '';
      };
      reader.readAsText(file);
  };

  const filteredContacts = contacts.filter(c => {
    const matchesSearch = 
      (c.name && c.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.docNumber && c.docNumber.includes(searchTerm));
    
    const matchesCategory = categoryFilter === 'ALL' || c.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const getCategoryBadge = (category) => {
      const catKey = Object.keys(CATEGORIES).find(k => CATEGORIES[k].label === category) || 'CLIENTE';
      const config = CATEGORIES[catKey];
      const Icon = config.icon;
      return (
          <Badge variant="outline" className={`${config.color} border-0 flex w-fit items-center gap-1`}>
              <Icon className="w-3 h-3" />
              {config.label}
          </Badge>
      );
  };

  return (
    <>
      <Helmet>
        <title>Contactos - JaiderHerTur26</title>
        <meta name="description" content="Gestiona tus clientes y proveedores" />
      </Helmet>

      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-4xl font-bold text-slate-900">Contactos</h1>
            <p className="text-slate-600">Gestiona los datos de personas y empresas</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <input type="file" ref={fileInputRef} onChange={handleImportFile} className="hidden" accept=".csv,.json" />
            {canAdd && <Button onClick={triggerImport} variant="outline" className="bg-white"><Upload className="w-4 h-4 mr-2" />Importar</Button>}
            <Button onClick={handleExport} variant="outline" className="bg-white"><Download className="w-4 h-4 mr-2" />Exportar</Button>
            {isReadOnly && <div className="flex items-center text-slate-400 text-sm ml-2"><Lock className="w-4 h-4 mr-1"/> Acceso Parcial</div>}
            {canAdd && <Button onClick={openDialogForNew} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Contacto
            </Button>}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-xl shadow-lg p-6 border border-slate-200 space-y-4">
          <div className="flex flex-col md:flex-row gap-4 justify-between md:items-center">
            <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                type="text"
                placeholder="Buscar por nombre, email o documento..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
            </div>
            <div className="flex gap-2 flex-wrap">
                <Button 
                    variant={categoryFilter === 'ALL' ? 'default' : 'outline'} 
                    onClick={() => setCategoryFilter('ALL')}
                    size="sm"
                >
                    Todos
                </Button>
                {Object.values(CATEGORIES).map(cat => (
                    <Button 
                        key={cat.label}
                        variant={categoryFilter === cat.label ? 'default' : 'outline'} 
                        onClick={() => setCategoryFilter(cat.label)}
                        size="sm"
                        className={categoryFilter === cat.label ? '' : 'text-slate-600'}
                    >
                        {cat.label}
                    </Button>
                ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
             <table className="w-full text-sm text-left">
                 <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                     <tr>
                         <th className="px-6 py-4">Nombre / Empresa</th>
                         <th className="px-6 py-4">Categoría</th>
                         <th className="px-6 py-4">Documento</th>
                         <th className="px-6 py-4">Contacto</th>
                         <th className="px-6 py-4 text-center">Acciones</th>
                     </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 bg-white">
                     {filteredContacts.length === 0 ? (
                        <tr><td colSpan="5" className="text-center py-12 text-slate-400">No se encontraron contactos.</td></tr>
                     ) : (
                        filteredContacts.map(contact => (
                            <tr key={contact.id} className="hover:bg-slate-50">
                                <td className="px-6 py-4">
                                    <div className="flex items-center">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${contact.type === 'person' ? 'bg-indigo-100 text-indigo-600' : 'bg-purple-100 text-purple-600'}`}>
                                            {contact.type === 'person' ? <User className="w-4 h-4" /> : <Building className="w-4 h-4" />}
                                        </div>
                                        <div>
                                            <p className="font-medium text-slate-900">{contact.name}</p>
                                            <p className="text-xs text-slate-500">{contact.email}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    {getCategoryBadge(contact.category)}
                                </td>
                                <td className="px-6 py-4 text-slate-600">
                                    <span className="font-mono text-xs font-semibold bg-slate-100 px-2 py-1 rounded">{contact.docType}</span> {contact.docNumber}
                                </td>
                                <td className="px-6 py-4 text-slate-600 text-xs">
                                    {contact.phone && <div className="flex items-center gap-1 mb-1"><span className="font-semibold">Tel:</span> {contact.phone}</div>}
                                    {contact.address && <div className="flex items-center gap-1"><span className="font-semibold">Dir:</span> {contact.address}</div>}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex justify-center gap-2">
                                        {canEdit && <Button variant="ghost" size="sm" onClick={() => openDialogForEdit(contact)} className="hover:bg-blue-50 text-blue-600">
                                            <Edit2 className="w-4 h-4" />
                                        </Button>}
                                        {canDelete && <Button variant="ghost" size="sm" onClick={() => handleDeleteContact(contact.id)} className="hover:bg-red-50 text-red-600">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>}
                                    </div>
                                </td>
                            </tr>
                        ))
                     )}
                 </tbody>
             </table>
          </div>
        </motion.div>
      </div>

      <ContactDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contact={editingContact}
        onSave={handleSaveContact}
      />
    </>
  );
};

const ContactDialog = ({ open, onOpenChange, contact, onSave }) => {
  const [formData, setFormData] = useState({
    type: 'person', 
    category: 'Cliente', 
    name: '', 
    email: '', 
    phone: '', 
    address: '', 
    docType: 'CC', 
    docNumber: ''
  });

  useEffect(() => {
    if (contact) {
      setFormData({
        type: contact.type || 'person',
        category: contact.category || 'Cliente',
        name: contact.name || '',
        email: contact.email || '',
        phone: contact.phone || '',
        address: contact.address || '',
        docType: contact.docType || 'CC',
        docNumber: contact.docNumber || '',
        id: contact.id
      });
    } else {
      setFormData({ 
        type: 'person', 
        category: 'Cliente',
        name: '', 
        email: '', 
        phone: '', 
        address: '', 
        docType: 'CC', 
        docNumber: '', 
        id: null 
      });
    }
  }, [contact, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">{contact ? 'Editar Contacto' : 'Nuevo Contacto'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label>Categoría *</Label>
                <Select value={formData.category} onValueChange={(val) => setFormData({ ...formData, category: val })}>
                    <SelectTrigger className="w-full bg-white">
                        <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Cliente">Cliente</SelectItem>
                        <SelectItem value="Proveedor">Proveedor</SelectItem>
                        <SelectItem value="Acreedor">Acreedor</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select value={formData.type} onValueChange={(val) => setFormData({ ...formData, type: val })}>
                    <SelectTrigger className="w-full bg-white">
                        <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="person">Persona</SelectItem>
                        <SelectItem value="company">Empresa</SelectItem>
                    </SelectContent>
                </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="name">Nombre / Razón Social *</Label>
            <input id="name" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="docType">Tipo Documento</Label>
              <select id="docType" value={formData.docType} onChange={(e) => setFormData({ ...formData, docType: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg">
                <option value="CC">C.C.</option>
                <option value="NIT">NIT</option>
                <option value="CE">C.E.</option>
                <option value="PAS">Pasaporte</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="docNumber">Número Documento *</Label>
              <input id="docNumber" required value={formData.docNumber} onChange={(e) => setFormData({ ...formData, docNumber: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Teléfono</Label>
            <input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Dirección</Label>
            <input id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">Guardar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default Contacts;