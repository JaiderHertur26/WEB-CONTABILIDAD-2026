import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, Search, Edit2, Trash2, User, Building, Download, Lock, Upload, Briefcase, Truck, CreditCard, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { exportProfessionalWorkbook } from '@/lib/excel';
import { useCompany } from '@/contexts/CompanyContext';
import * as XLSX from 'xlsx';
import { usePermission } from '@/hooks/usePermission';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from '@/lib/utils';

const CATEGORIES = {
  CLIENTE: { label: 'Cliente', color: 'bg-blue-100 text-blue-800', icon: User },
  PROVEEDOR: { label: 'Proveedor', color: 'bg-green-100 text-green-800', icon: Truck },
  ACREEDOR: { label: 'Acreedor', color: 'bg-orange-100 text-orange-800', icon: CreditCard }
};

const normalizeText = (value) => String(value ?? '')
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .toUpperCase();

const normalizeDocType = (value, contactType = 'person') => {
  const normalized = normalizeText(value).replace(/\./g, '');
  if (['CC', 'CEDULA', 'CEDULA DE CIUDADANIA'].includes(normalized)) return 'CC';
  if (normalized === 'NIT') return 'NIT';
  if (['CE', 'CEDULA DE EXTRANJERIA'].includes(normalized)) return 'CE';
  if (['PAS', 'PASAPORTE', 'PASSPORT'].includes(normalized)) return 'PAS';
  return contactType === 'company' ? 'NIT' : 'CC';
};

const normalizeContactType = (value, docType = '') => {
  const normalized = normalizeText(value);
  if (['EMPRESA', 'COMPANY', 'JURIDICA', 'PERSONA JURIDICA'].includes(normalized)) return 'company';
  if (['PERSONA', 'PERSON', 'NATURAL', 'PERSONA NATURAL'].includes(normalized)) return 'person';
  return normalizeDocType(docType) === 'NIT' ? 'company' : 'person';
};

const normalizeCategory = (value) => {
  const normalized = normalizeText(value);
  if (normalized === 'PROVEEDOR') return 'Proveedor';
  if (normalized === 'ACREEDOR') return 'Acreedor';
  return 'Cliente';
};

const cleanDocumentNumber = (value) => String(value ?? '').trim().replace(/^'+/, '');

const contactDocumentKey = (docType, docNumber, type = 'person') => {
  const normalizedType = normalizeDocType(docType, type);
  const normalizedNumber = cleanDocumentNumber(docNumber).replace(/[^0-9A-Z]/gi, '').toUpperCase();
  return normalizedNumber ? `${normalizedType}:${normalizedNumber}` : '';
};

const contactComparable = (contact) => ({
  name: normalizeText(contact?.name),
  category: normalizeCategory(contact?.category),
  type: normalizeContactType(contact?.type, contact?.docType),
  docType: normalizeDocType(contact?.docType, contact?.type),
  docNumber: cleanDocumentNumber(contact?.docNumber).replace(/[^0-9A-Z]/gi, '').toUpperCase(),
  email: normalizeText(contact?.email),
  phone: cleanDocumentNumber(contact?.phone).replace(/\s+/g, ''),
  address: normalizeText(contact?.address),
});

const sameContactData = (a, b) =>
  JSON.stringify(contactComparable(a)) === JSON.stringify(contactComparable(b));

const Contacts = () => {
  const { canEdit, canDelete, canAdd, isReadOnly } = usePermission();
  const { activeCompany } = useCompany();
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

    const normalizedType = normalizeContactType(contact.type, contact.docType);
    const normalizedDocType = normalizeDocType(contact.docType, normalizedType);
    const normalizedCategory = normalizeCategory(contact.category);
    const docNumber = cleanDocumentNumber(contact.docNumber);
    const key = contactDocumentKey(normalizedDocType, docNumber, normalizedType);

    if (!contact.name?.trim() || !key) {
      toast({
        variant: 'destructive',
        title: 'Datos incompletos',
        description: 'Nombre/Razón Social y documento son obligatorios.'
      });
      return;
    }

    const duplicate = (contacts || []).find(c =>
      c.id !== editingContact?.id &&
      contactDocumentKey(c.docType, c.docNumber, c.type) === key
    );

    if (duplicate) {
      toast({
        variant: 'destructive',
        title: 'Documento duplicado',
        description: `Ya existe "${duplicate.name}" con ${normalizedDocType} ${docNumber}. Edite ese contacto en lugar de crear otro.`
      });
      return;
    }

    const normalizedContact = {
      ...contact,
      name: String(contact.name || '').trim().replace(/\s+/g, ' '),
      category: normalizedCategory,
      type: normalizedType,
      docType: normalizedDocType,
      docNumber,
      email: String(contact.email || '').trim(),
      phone: String(contact.phone || '').trim(),
      address: String(contact.address || '').trim().replace(/\s+/g, ' ')
    };

    let updatedContacts;
    if (editingContact) {
      updatedContacts = contacts.map(c => c.id === editingContact.id ? normalizedContact : c);
      toast({ title: "¡Contacto actualizado!", description: "Los cambios se guardaron correctamente." });
    } else {
      updatedContacts = [...contacts, { ...normalizedContact, id: crypto.randomUUID() }];
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
    if (!contacts?.length) {
      toast({ variant: 'destructive', title: "No hay contactos para exportar" });
      return;
    }

    const sortedContacts = [...contacts].sort((a, b) => {
      const categoryCompare = normalizeCategory(a.category).localeCompare(normalizeCategory(b.category), 'es');
      if (categoryCompare !== 0) return categoryCompare;
      const typeCompare = normalizeContactType(a.type, a.docType).localeCompare(normalizeContactType(b.type, b.docType));
      if (typeCompare !== 0) return typeCompare;
      return String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base', numeric: true });
    });

    const rows = sortedContacts.map((c, index) => ({
      'N°': index + 1,
      'Nombre / Razón Social': String(c.name || '').trim(),
      'Categoría': normalizeCategory(c.category),
      'Tipo': normalizeContactType(c.type, c.docType) === 'company' ? 'Empresa' : 'Persona',
      'Tipo Documento': normalizeDocType(c.docType, c.type),
      'Número Documento': cleanDocumentNumber(c.docNumber),
      'Email': String(c.email || '').trim(),
      'Teléfono': String(c.phone || '').trim(),
      'Dirección': String(c.address || '').trim()
    }));

    const totals = {
      total: rows.length,
      people: rows.filter(r => r.Tipo === 'Persona').length,
      companies: rows.filter(r => r.Tipo === 'Empresa').length,
      clients: rows.filter(r => r.Categoría === 'Cliente').length,
      suppliers: rows.filter(r => r.Categoría === 'Proveedor').length,
      creditors: rows.filter(r => r.Categoría === 'Acreedor').length
    };

    exportProfessionalWorkbook({
      fileName: 'Contactos',
      companyName: activeCompany?.name || 'ENTIDAD CONTABLE',
      nit: activeCompany?.doc || '',
      title: 'MAESTRO DE CONTACTOS',
      period: `CORTE ${new Date().toLocaleDateString('es-CO')}`,
      showCurrency: false,
      controlNature: 'Maestro de contactos y terceros para identificación, facturación, compras, cartera y obligaciones.',
      controlNotes: [
        'La información debe mantenerse actualizada y contrastarse con documentos de identificación y datos suministrados por cada tercero.',
        'Los cambios de documento, razón social o datos de contacto deben realizarse preservando la trazabilidad del tercero.'
      ],
      sheets: [
        {
          name: 'Contactos',
          title: 'MAESTRO DE CONTACTOS',
          period: `CORTE ${new Date().toLocaleDateString('es-CO')}`,
          orientation: 'landscape',
          columns: [
            { key: 'N°', label: 'N°', width: 7, type: 'integer' },
            { key: 'Nombre / Razón Social', label: 'NOMBRE / RAZÓN SOCIAL', width: 38, type: 'text' },
            { key: 'Categoría', label: 'CATEGORÍA', width: 16, type: 'text' },
            { key: 'Tipo', label: 'TIPO', width: 14, type: 'text' },
            { key: 'Tipo Documento', label: 'TIPO DOCUMENTO', width: 17, type: 'text' },
            { key: 'Número Documento', label: 'NÚMERO DOCUMENTO', width: 22, type: 'text' },
            { key: 'Email', label: 'EMAIL', width: 30, type: 'text' },
            { key: 'Teléfono', label: 'TELÉFONO', width: 18, type: 'text' },
            { key: 'Dirección', label: 'DIRECCIÓN', width: 38, type: 'text' }
          ],
          rows,
          notes: [
            'El número de documento se exporta como texto para conservar guiones y ceros iniciales.',
            'Este archivo puede editarse y volver a importarse desde el mismo módulo de Contactos.',
            'Los contactos antiguos sin categoría explícita se normalizan como Cliente.'
          ]
        },
        {
          name: 'Resumen',
          title: 'RESUMEN DEL MAESTRO DE CONTACTOS',
          period: `CORTE ${new Date().toLocaleDateString('es-CO')}`,
          columns: [
            { key: 'Indicador', label: 'INDICADOR', width: 42, type: 'text' },
            { key: 'Cantidad', label: 'CANTIDAD', width: 16, type: 'integer' }
          ],
          rows: [
            { Indicador: 'TOTAL CONTACTOS', Cantidad: totals.total, __style: 'total' },
            { Indicador: 'PERSONAS NATURALES', Cantidad: totals.people },
            { Indicador: 'EMPRESAS', Cantidad: totals.companies },
            { Indicador: 'CLIENTES', Cantidad: totals.clients },
            { Indicador: 'PROVEEDORES', Cantidad: totals.suppliers },
            { Indicador: 'ACREEDORES', Cantidad: totals.creditors }
          ]
        }
      ]
    });

    toast({ title: "Excel profesional generado", description: "El maestro de Contactos fue exportado con resumen y hoja de control." });
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
              const fileName = String(file.name || '').toLowerCase();
              const buffer = event.target.result;
              let parsedData = [];
              let sourceLabel = file.name;

              const normalizeHeader = (value) => normalizeText(value)
                .replace(/[\/\\]/g, ' ')
                .replace(/\s+/g, ' ');

              const headerAliases = {
                name: ['NOMBRE / RAZON SOCIAL', 'NOMBRE RAZON SOCIAL', 'NOMBRE', 'RAZON SOCIAL', 'NAME'],
                category: ['CATEGORIA', 'CATEGORY', 'TIPO CONTACTO'],
                type: ['TIPO', 'TYPE', 'TIPO PERSONA', 'PERSONA / EMPRESA', 'PERSONA EMPRESA'],
                docType: ['TIPO DOCUMENTO', 'TIPO DOC', 'TIPO IDENTIFICACION', 'DOCUMENT TYPE', 'DOCTYPE'],
                docNumber: [
                  'NUMERO DOCUMENTO', 'N DOCUMENTO', 'NRO DOCUMENTO', 'DOCUMENTO',
                  'IDENTIFICACION', 'NUMERO IDENTIFICACION', 'NIT CC', 'DOCUMENT NUMBER', 'DOCNUMBER'
                ],
                email: ['EMAIL', 'CORREO', 'CORREO ELECTRONICO', 'E MAIL'],
                phone: ['TELEFONO', 'CELULAR', 'MOVIL', 'PHONE'],
                address: ['DIRECCION', 'DOMICILIO', 'ADDRESS']
              };

              const findHeaderIndex = (headers, aliases) =>
                headers.findIndex(header => aliases.includes(normalizeHeader(header)));

              const matrixToContacts = (matrix, sheetName = 'Datos') => {
                for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 50); rowIndex += 1) {
                  const row = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : [];
                  const headers = row.map(normalizeHeader);
                  const indexes = {
                    name: findHeaderIndex(headers, headerAliases.name),
                    category: findHeaderIndex(headers, headerAliases.category),
                    type: findHeaderIndex(headers, headerAliases.type),
                    docType: findHeaderIndex(headers, headerAliases.docType),
                    docNumber: findHeaderIndex(headers, headerAliases.docNumber),
                    email: findHeaderIndex(headers, headerAliases.email),
                    phone: findHeaderIndex(headers, headerAliases.phone),
                    address: findHeaderIndex(headers, headerAliases.address)
                  };

                  if (indexes.name < 0 || indexes.docNumber < 0) continue;

                  const result = [];
                  for (let dataIndex = rowIndex + 1; dataIndex < matrix.length; dataIndex += 1) {
                    const dataRow = matrix[dataIndex] || [];
                    const rawName = indexes.name >= 0 ? dataRow[indexes.name] : '';
                    const rawDocNumber = indexes.docNumber >= 0 ? dataRow[indexes.docNumber] : '';

                    if (!String(rawName || '').trim() && !String(rawDocNumber || '').trim()) continue;

                    result.push({
                      name: rawName,
                      category: indexes.category >= 0 ? dataRow[indexes.category] : '',
                      type: indexes.type >= 0 ? dataRow[indexes.type] : '',
                      docType: indexes.docType >= 0 ? dataRow[indexes.docType] : '',
                      docNumber: rawDocNumber,
                      email: indexes.email >= 0 ? dataRow[indexes.email] : '',
                      phone: indexes.phone >= 0 ? dataRow[indexes.phone] : '',
                      address: indexes.address >= 0 ? dataRow[indexes.address] : ''
                    });
                  }

                  if (result.length > 0) {
                    sourceLabel = `${file.name} · ${sheetName}`;
                    return result;
                  }
                }
                return [];
              };

              if (fileName.endsWith('.json')) {
                const text = new TextDecoder('utf-8').decode(buffer);
                const json = JSON.parse(text);
                parsedData = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
              } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
                const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: false });
                for (const sheetName of workbook.SheetNames) {
                  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
                    header: 1,
                    defval: '',
                    raw: false,
                    blankrows: false
                  });
                  parsedData = matrixToContacts(matrix, sheetName);
                  if (parsedData.length > 0) break;
                }
              } else if (fileName.endsWith('.csv')) {
                const text = new TextDecoder('utf-8').decode(buffer);
                const workbook = XLSX.read(text, { type: 'string', raw: false });
                const sheetName = workbook.SheetNames[0];
                const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
                  header: 1,
                  defval: '',
                  raw: false,
                  blankrows: false
                });
                parsedData = matrixToContacts(matrix, 'CSV');
              } else {
                toast({
                  variant: 'destructive',
                  title: 'Formato no soportado',
                  description: 'Use Excel (.xlsx/.xls), CSV o JSON.'
                });
                return;
              }

              if (!Array.isArray(parsedData) || parsedData.length === 0) {
                throw new Error('No se encontró una tabla válida de contactos.');
              }

              const existingByKey = new Map();
              (contacts || []).forEach(contact => {
                const key = contactDocumentKey(contact.docType, contact.docNumber, contact.type);
                if (key) existingByKey.set(key, contact);
              });

              const importedByKey = new Map();
              const newContacts = [...(contacts || [])];
              const conflicts = [];
              let addedCount = 0;
              let exactDuplicates = 0;
              let invalidCount = 0;
              let fileDuplicates = 0;

              parsedData.forEach((item) => {
                const rawName = item.name ?? item.Nombre ?? item.nombre ?? item['Nombre / Razón Social'] ?? item['Nombre / Razon Social'];
                const rawDocNumber = item.docNumber ?? item['Número Documento'] ?? item['Numero Documento'] ?? item.doc_number ?? item.Documento;
                const rawType = item.type ?? item.Tipo ?? '';
                const rawDocType = item.docType ?? item['Tipo Documento'] ?? item.tipo_documento ?? '';
                const type = normalizeContactType(rawType, rawDocType);
                const docType = normalizeDocType(rawDocType, type);
                const docNumber = cleanDocumentNumber(rawDocNumber);
                const name = String(rawName || '').trim().replace(/\s+/g, ' ');
                const key = contactDocumentKey(docType, docNumber, type);

                if (!name || !key) {
                  invalidCount += 1;
                  return;
                }

                const candidate = {
                  id: crypto.randomUUID(),
                  name,
                  category: normalizeCategory(item.category ?? item.Categoría ?? item.Categoria),
                  type,
                  docType,
                  docNumber,
                  email: String(item.email ?? item.Email ?? item.Correo ?? '').trim(),
                  phone: String(item.phone ?? item.Teléfono ?? item.Telefono ?? item.Celular ?? '').trim(),
                  address: String(item.address ?? item.Dirección ?? item.Direccion ?? '').trim().replace(/\s+/g, ' ')
                };

                const alreadyInFile = importedByKey.get(key);
                if (alreadyInFile) {
                  if (sameContactData(alreadyInFile, candidate)) fileDuplicates += 1;
                  else conflicts.push(`${docType} ${docNumber}: dos registros distintos dentro del archivo`);
                  return;
                }
                importedByKey.set(key, candidate);

                const existing = existingByKey.get(key);
                if (existing) {
                  if (sameContactData(existing, candidate)) exactDuplicates += 1;
                  else conflicts.push(`${docType} ${docNumber}: existe "${existing.name}", archivo "${candidate.name}"`);
                  return;
                }

                newContacts.push(candidate);
                existingByKey.set(key, candidate);
                addedCount += 1;
              });

              if (addedCount > 0) {
                newContacts.sort((a, b) =>
                  String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base', numeric: true })
                );
                saveContacts(newContacts);
              }

              const parts = [
                `${addedCount} nuevos`,
                `${exactDuplicates} duplicados exactos`,
                `${fileDuplicates} duplicados dentro del archivo`,
                `${invalidCount} inválidos`,
                `${conflicts.length} conflictos no sobrescritos`
              ];

              toast({
                title: addedCount > 0 ? 'Importación de Contactos completada' : 'Importación revisada sin contactos nuevos',
                description: `${parts.join(' · ')}. Fuente: ${sourceLabel}.`
              });

              if (conflicts.length > 0) {
                console.warn('Conflictos detectados al importar Contactos:', conflicts);
              }
          } catch (error) {
              console.error(error);
              toast({
                variant: 'destructive',
                title: 'Error al importar',
                description: error?.message || 'No se pudo procesar el archivo de Contactos.'
              });
          } finally {
              e.target.value = '';
          }
      };
      reader.readAsArrayBuffer(file);
  };

  const filteredContacts = (contacts || []).filter(c => {
    const normalizedSearch = searchTerm.toLowerCase();
    const matchesSearch = 
      (c.name && c.name.toLowerCase().includes(normalizedSearch)) ||
      (c.email && c.email.toLowerCase().includes(normalizedSearch)) ||
      (c.phone && String(c.phone).toLowerCase().includes(normalizedSearch)) ||
      (c.docNumber && String(c.docNumber).toLowerCase().includes(normalizedSearch));
    
    const matchesCategory = categoryFilter === 'ALL' || normalizeCategory(c.category) === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const getCategoryBadge = (category) => {
      const normalizedCategory = normalizeCategory(category);
      const catKey = Object.keys(CATEGORIES).find(k => CATEGORIES[k].label === normalizedCategory) || 'CLIENTE';
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
            <input type="file" ref={fileInputRef} onChange={handleImportFile} className="hidden" accept=".xlsx,.xls,.csv,.json" />
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