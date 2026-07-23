import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, Download, Edit2, Trash2, Archive, Search, CalendarPlus, Upload, Lock, FileText, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext';
import { exportToExcel } from '@/lib/excel';
import * as XLSX from 'xlsx';
import { usePermission } from '@/hooks/usePermission';

// IMPORTACIÓN DE LA LIBRERÍA PARA WORD
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, PageOrientation } from 'docx';

const FixedAssets = () => {
    const { canEdit, canDelete, canAdd, canImport, isReadOnly } = usePermission();
    const { activeCompany } = useCompany();
    const [assets, saveAssets] = useCompanyData('fixedAssets');
    const [transactions, saveTransactions] = useCompanyData('transactions');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [newYearDialogOpen, setNewYearDialogOpen] = useState(false);
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [editingAsset, setEditingAsset] = useState(null);
    const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());
    const [searchTerm, setSearchTerm] = useState('');
    const { toast } = useToast();

    const handleSaveAsset = (assetData) => {
        if (!canAdd && !editingAsset) return;
        if (!canEdit && editingAsset) return;

        let updatedAssets;
        if (editingAsset) {
            updatedAssets = assets.map(asset => asset.id === editingAsset.id ? { ...asset, ...assetData } : asset);
            toast({ title: "Activo actualizado" });
        } else {
            updatedAssets = [...(assets || []), { ...assetData, id: Date.now().toString(), year: yearFilter }];
            toast({ title: "Activo creado manualmente" });
        }
        saveAssets(updatedAssets);
        setDialogOpen(false);
    };

    const handleDeleteAsset = (id) => {
        if (!canDelete) return;

        const assetToDelete = assets.find(asset => asset.id === id);
        
        if (assetToDelete && assetToDelete.transactionId) {
             const transactionToUpdate = transactions.find(t => t.id === assetToDelete.transactionId);
             if (transactionToUpdate) {
                 const updatedTransactions = transactions.map(t => 
                    t.id === assetToDelete.transactionId 
                        ? { ...t, isFixedAsset: false } 
                        : t
                 );
                 saveTransactions(updatedTransactions);
                 toast({ title: "Contabilidad Ajustada", description: "El gasto de compra se ha reclasificado como gasto corriente para cuadrar el balance." });
             }
        }

        saveAssets(assets.filter(asset => asset.id !== id));
        toast({ title: "Activo eliminado", description: "El activo ha sido retirado del inventario." });
    };

    const handleCloneYear = () => {
        if (!canAdd) return;
        const currentYear = new Date().getFullYear();
        if (parseInt(yearFilter) >= currentYear) {
            toast({ variant: 'destructive', title: "Acción no permitida", description: "Solo puedes clonar inventarios de años anteriores al actual." });
            return;
        }

        const assetsToClone = assets.filter(asset => asset.year === yearFilter);
        const clonedAssets = assetsToClone.map(asset => ({ ...asset, id: `cloned-${Date.now()}-${Math.random()}`, year: currentYear.toString(), transactionId: null }));
        
        saveAssets([...assets, ...clonedAssets]);
        setYearFilter(currentYear.toString());
        toast({ title: "Inventario Clonado", description: `Se creó el inventario para ${currentYear} basado en ${yearFilter}.` });
    };
    
    // --- EXPORTAR EXCEL ---
    const handleExportExcel = () => {
        if(filteredAssets.length === 0) {
            toast({ variant: 'destructive', title: "No hay datos para exportar"});
            return;
        }

        let totalValue = 0;
        const excelData = filteredAssets.map(a => {
            const val = parseFloat(a.value) || 0;
            totalValue += val;
            return {
                'CANT.': a.quantity || 1, 
                'NOMBRE DEL ACTIVO': a.name, 
                'MARCA / MODELO / SERIE': a.model || '', 
                'CATEGORIA DEL ACTIVO': a.category || '',
                'USO/DESUSO/ PRESTAMO': a.usage || '', 
                'ESTADO Bueno/Malo/Regular': a.status, 
                'VALOR NETO': val, 
                'OBSERVACIONES': a.notes || ''
            };
        });

        excelData.push({
            'CANT.': '', 'NOMBRE DEL ACTIVO': '', 'MARCA / MODELO / SERIE': '', 'CATEGORIA DEL ACTIVO': '',
            'USO/DESUSO/ PRESTAMO': '', 'ESTADO Bueno/Malo/Regular': 'TOTAL', 'VALOR NETO': totalValue, 'OBSERVACIONES': ''
        });

        exportToExcel(excelData, `Inventario_Activos_Fijos_${yearFilter}`);
    };

    // --- NUEVO: EXPORTAR A WORD (EDITABLE) ---
    const handleExportWord = async () => {
        if(filteredAssets.length === 0) {
            toast({ variant: 'destructive', title: "No hay datos para exportar"});
            return;
        }

        try {
            const parroquia = activeCompany?.name || '___________________________';
            const direccion = activeCompany?.address || '___________________________';
            const telefono = activeCompany?.phone || '___________________________';
            const fecha = new Date().toLocaleDateString();

            // Configurar los bordes invisibles para el encabezado y firmas
            const noBorders = {
                top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
                insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
            };

            // 1. Tabla de Encabezado (Sin bordes)
            const headerTable = new Table({
                borders: noBorders,
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({ children: [
                        new TableCell({ children: [new Paragraph(`Parroquia: ${parroquia}`)] }),
                        new TableCell({ children: [new Paragraph(`Párroco Actual: ___________________________`)] }),
                    ]}),
                    new TableRow({ children: [
                        new TableCell({ children: [new Paragraph(`Dirección: ${direccion}`)] }),
                        new TableCell({ children: [new Paragraph(`Barrio: ___________________________`)] }),
                    ]}),
                    new TableRow({ children: [
                        new TableCell({ children: [new Paragraph(`Sección a Inventariar: ___________________________`)] }),
                        new TableCell({ children: [new Paragraph(`Teléfono: ${telefono}`)] }),
                    ]}),
                    new TableRow({ children: [
                        new TableCell({ children: [new Paragraph("")] }),
                        new TableCell({ children: [new Paragraph(`Fecha: ${fecha}`)] }),
                    ]})
                ]
            });

            // 2. Tabla Principal de Inventario
            const tableRows = [];

            // Fila de Títulos
            tableRows.push(
                new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph({ text: "CANT.", alignment: AlignmentType.CENTER })], shading: { fill: "E0E0E0" } }),
                        new TableCell({ children: [new Paragraph({ text: "NOMBRE DEL ACTIVO", alignment: AlignmentType.CENTER })], shading: { fill: "E0E0E0" } }),
                        new TableCell({ children: [new Paragraph({ text: "MARCA/MODELO /\nSERIE", alignment: AlignmentType.CENTER })], shading: { fill: "E0E0E0" } }),
                        new TableCell({ children: [new Paragraph({ text: "CATEGORIA\nDEL ACTIVO", alignment: AlignmentType.CENTER })], shading: { fill: "E0E0E0" } }),
                        new TableCell({ children: [new Paragraph({ text: "USO/DESUSO/\nPRESTAMO", alignment: AlignmentType.CENTER })], shading: { fill: "E0E0E0" } }),
                        new TableCell({ children: [new Paragraph({ text: "ESTADO\nBueno/Malo/Regular", alignment: AlignmentType.CENTER })], shading: { fill: "E0E0E0" } }),
                        new TableCell({ children: [new Paragraph({ text: "VALOR NETO", alignment: AlignmentType.CENTER })], shading: { fill: "E0E0E0" } }),
                        new TableCell({ children: [new Paragraph({ text: "OBSERVACIONES", alignment: AlignmentType.CENTER })], shading: { fill: "E0E0E0" } }),
                    ]
                })
            );

            let totalValue = 0;
            filteredAssets.forEach(asset => {
                const val = parseFloat(asset.value) || 0;
                totalValue += val;
                tableRows.push(
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ text: (asset.quantity || 1).toString(), alignment: AlignmentType.CENTER })] }),
                            new TableCell({ children: [new Paragraph({ text: asset.name || '' })] }),
                            new TableCell({ children: [new Paragraph({ text: asset.model || '' })] }),
                            new TableCell({ children: [new Paragraph({ text: asset.category || '' })] }),
                            new TableCell({ children: [new Paragraph({ text: asset.usage || '', alignment: AlignmentType.CENTER })] }),
                            new TableCell({ children: [new Paragraph({ text: asset.status || '', alignment: AlignmentType.CENTER })] }),
                            new TableCell({ children: [new Paragraph({ text: `$${val.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`, alignment: AlignmentType.RIGHT })] }),
                            new TableCell({ children: [new Paragraph({ text: asset.notes || '' })] }),
                        ]
                    })
                );
            });

            // Fila de Totales
            tableRows.push(
                new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph("")] }),
                        new TableCell({ children: [new Paragraph("")] }),
                        new TableCell({ children: [new Paragraph("")] }),
                        new TableCell({ children: [new Paragraph("")] }),
                        new TableCell({ children: [new Paragraph("")] }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "TOTAL", bold: true })], alignment: AlignmentType.CENTER })], shading: { fill: "F5F5F5" } }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `$${totalValue.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`, bold: true })], alignment: AlignmentType.RIGHT })], shading: { fill: "F5F5F5" } }),
                        new TableCell({ children: [new Paragraph("")] }),
                    ]
                })
            );

            const inventoryTable = new Table({
                rows: tableRows,
                width: { size: 100, type: WidthType.PERCENTAGE },
            });

            // 3. Tabla de Firmas (Sin bordes)
            const signaturesTable = new Table({
                borders: noBorders,
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({ children: [
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Reviso:", bold: true })] })] }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Ecónomo:", bold: true })] })] }),
                    ]}),
                    new TableRow({ children: [
                        new TableCell({ children: [new Paragraph({ text: "_________________________________", spacing: { before: 600 } })] }),
                        new TableCell({ children: [new Paragraph({ text: "_________________________________", spacing: { before: 600 } })] }),
                    ]}),
                    new TableRow({ children: [
                        new TableCell({ children: [new Paragraph("Nombre y Firma")] }),
                        new TableCell({ children: [new Paragraph("Nombre y Firma")] }),
                    ]}),
                ]
            });

            // Ensamblar el Documento Word
            const doc = new Document({
                sections: [{
                    properties: {
                        page: {
                            size: { orientation: PageOrientation.LANDSCAPE }, // APAISADO
                            margin: { top: 720, right: 720, bottom: 720, left: 720 }, // Márgenes estrechos
                        },
                    },
                    children: [
                        new Paragraph({ children: [new TextRun({ text: "Arquidiócesis de Barranquilla", bold: true, size: 24 })] }),
                        new Paragraph({
                            children: [new TextRun({ text: "INVENTARIO", bold: true, size: 32 })],
                            alignment: AlignmentType.CENTER,
                            spacing: { after: 400 },
                        }),
                        headerTable,
                        new Paragraph({ text: "", spacing: { after: 200 } }),
                        inventoryTable,
                        new Paragraph({ text: "", spacing: { before: 600 } }),
                        signaturesTable,
                        new Paragraph({
                            children: [new TextRun({ text: "Versión 001-Creado 31/05/2018", size: 16 })],
                            spacing: { before: 400 }
                        })
                    ]
                }]
            });

            // Generar y descargar el archivo de forma nativa
            const blob = await Packer.toBlob(doc);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `CONTROL_INVENTARIOS_${activeCompany?.name || 'Parroquia'}_${yearFilter}.docx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast({ title: "Word Generado con éxito", description: "Descarga iniciada" });

        } catch (error) {
            console.error("Error crítico generando el Word:", error);
            toast({ variant: 'destructive', title: 'Error al generar', description: 'No se pudo crear el archivo Word. Revisa la consola.' });
        }
    };
    
    const handleImport = (importedAssets) => {
        if (!canImport) return;
        const newAssets = importedAssets.map(asset => ({
            ...asset,
            id: Date.now().toString() + Math.random(),
            year: yearFilter,
        }));
        saveAssets([...(assets || []), ...newAssets]);
        toast({ title: "¡Importación exitosa!", description: `${newAssets.length} activos han sido añadidos al inventario de ${yearFilter}.` });
        setImportDialogOpen(false);
    };

    const [availableYears, setAvailableYears] = useState([]);

    useEffect(() => {
        const yearsFromAssets = (assets || []).map(a => a.year);
        const uniqueYears = [...new Set(yearsFromAssets)].sort((a,b) => b-a);
        if (!uniqueYears.includes(new Date().getFullYear().toString())) {
            uniqueYears.unshift(new Date().getFullYear().toString());
        }
        setAvailableYears(uniqueYears);
    }, [assets]);

    const handleAddYear = (newYear) => {
        if (!canAdd) return;
        if (newYear && !availableYears.includes(newYear)) {
            const updatedYears = [...availableYears, newYear].sort((a, b) => b-a);
            setAvailableYears(updatedYears);
            setYearFilter(newYear);
            toast({ title: `Año ${newYear} añadido`, description: 'Ahora puedes empezar a añadir activos para este año.' });
        }
        setNewYearDialogOpen(false);
    };

    const filteredAssets = (assets || []).filter(asset => asset.year === yearFilter && asset.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <>
        <Helmet><title>Activos Fijos - JaiderHerTur26</title></Helmet>
        <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-center">
                <div><h1 className="text-4xl font-bold text-slate-900">Inventario de Activos Fijos</h1></div>
                <div className="flex items-center gap-2">
                    {isReadOnly && <span className="flex items-center text-slate-400 text-sm"><Lock className="w-4 h-4 mr-1"/>Acceso Parcial</span>}
                    {canAdd && <Button onClick={() => { setEditingAsset(null); setDialogOpen(true); }} className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-2" /> Nuevo Activo</Button>}
                </div>
            </motion.div>
            
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl shadow-lg p-6 border flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[150px]"><Label>Filtrar por Año:</Label><select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="w-full mt-1 p-2 border rounded-lg"><option value="" disabled>Selecciona año</option>{availableYears.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
                <div className="flex-1 min-w-[200px] relative"><Label>Buscar Activo:</Label><Search className="absolute left-3 top-10 transform -translate-y-1/2 text-slate-400 w-5 h-5" /><input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full mt-1 pl-10 pr-4 py-2 border rounded-lg" /></div>
                <div className="flex gap-2 flex-wrap">
                    {canAdd && <Button onClick={() => setNewYearDialogOpen(true)} variant="outline"><CalendarPlus className="w-4 h-4 mr-2"/>Añadir Año</Button>}
                    {canImport && <Button onClick={() => setImportDialogOpen(true)} variant="outline"><Upload className="w-4 h-4 mr-2" /> Importar</Button>}
                    
                    {/* BOTONES DE EXPORTACIÓN */}
                    <Button onClick={handleExportExcel} variant="outline" className="border-green-200 text-green-700 hover:bg-green-50"><FileSpreadsheet className="w-4 h-4 mr-2" /> Excel</Button>
                    <Button onClick={handleExportWord} variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50"><FileText className="w-4 h-4 mr-2" /> Word</Button>
                    
                    {canAdd && <Button onClick={handleCloneYear} variant="outline">Clonar a Año Actual</Button>}
                </div>
            </motion.div>

            {filteredAssets.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 bg-white rounded-xl shadow-lg border">
                    <Archive className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">No hay activos registrados para el año {yearFilter}.</p>
                </motion.div>
            ) : (
                <div className="bg-white rounded-xl shadow-lg border overflow-x-auto"><table className="w-full text-sm">
                    <thead className="bg-slate-50"><tr>{['Cant.', 'Activo', 'Marca/Modelo', 'Categoría', 'Uso', 'Estado', 'Lugar', 'Valor Total', 'Acciones'].map(h => <th key={h} className="p-3 text-left font-semibold">{h}</th>)}</tr></thead>
                    <tbody className="divide-y">{filteredAssets.map(asset => (<tr key={asset.id} className="hover:bg-slate-50">
                        <td className="p-3">{asset.quantity || 1}</td><td className="p-3 font-medium">{asset.name}</td><td className="p-3">{asset.model}</td><td className="p-3">{asset.category}</td><td className="p-3">{asset.usage}</td><td className="p-3">{asset.status}</td><td className="p-3">{asset.location}</td><td className="p-3 font-mono">${parseFloat(asset.value).toLocaleString('es-ES')}</td>
                        <td className="p-3"><div className="flex gap-1">
                            {canEdit && <Button size="icon" variant="ghost" onClick={() => { setEditingAsset(asset); setDialogOpen(true); }}><Edit2 className="w-4 h-4" /></Button>}
                            {canDelete && <Button size="icon" variant="ghost" className="hover:text-red-600" onClick={() => handleDeleteAsset(asset.id)}><Trash2 className="w-4 h-4" /></Button>}
                        </div></td>
                    </tr>))}</tbody>
                </table></div>
            )}
        </div>
        <AssetDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSaveAsset} asset={editingAsset} />
        <NewYearDialog open={newYearDialogOpen} onOpenChange={setNewYearDialogOpen} onAdd={handleAddYear} />
        <ImportDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} onImport={handleImport} />
        </>
    );
}

const AssetDialog = ({ open, onOpenChange, onSave, asset }) => {
    const [data, setData] = useState({ quantity: 1, name: '', model: '', category: '', usage: 'Uso', status: 'Bueno', location: '', value: '', notes: '' });
    useEffect(() => { if(open) { if(asset) setData(asset); else setData({ quantity: 1, name: '', model: '', category: '', usage: 'Uso', status: 'Bueno', location: '', value: '', notes: '' }); } }, [asset, open]);
    const handleSubmit = e => { e.preventDefault(); onSave(data); };

    return(<Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{asset ? 'Editar' : 'Nuevo'} Activo Fijo</DialogTitle></DialogHeader><form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
        <div className="space-y-1"><Label>Nombre del Activo</Label><input required value={data.name} onChange={e => setData({...data, name: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
        <div className="space-y-1"><Label>Cantidad</Label><input type="number" required value={data.quantity} onChange={e => setData({...data, quantity: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
        <div className="space-y-1"><Label>Marca/Modelo/Serie</Label><input value={data.model || ''} onChange={e => setData({...data, model: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
        <div className="space-y-1"><Label>Categoría</Label><input value={data.category || ''} onChange={e => setData({...data, category: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
        <div className="space-y-1"><Label>Uso</Label><select value={data.usage || 'Uso'} onChange={e => setData({...data, usage: e.target.value})} className="w-full p-2 border rounded-lg"><option>Uso</option><option>Desuso</option><option>Préstamo</option></select></div>
        <div className="space-y-1"><Label>Estado</Label><select value={data.status || 'Bueno'} onChange={e => setData({...data, status: e.target.value})} className="w-full p-2 border rounded-lg"><option>Bueno</option><option>Regular</option><option>Malo</option></select></div>
        <div className="space-y-1"><Label>Lugar a inventariar</Label><input value={data.location || ''} onChange={e => setData({...data, location: e.target.value})} className="w-full p-2 border rounded-lg" placeholder="Ej: Templo, Sacristía, etc."/></div>
        <div className="space-y-1"><Label>Valor Total</Label><input type="number" step="0.01" required value={data.value} onChange={e => setData({...data, value: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
        <div className="md:col-span-2 space-y-1"><Label>Observaciones</Label><textarea value={data.notes || ''} onChange={e => setData({...data, notes: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
        <div className="md:col-span-2 flex justify-end gap-2 pt-4"><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose><Button type="submit" className="bg-blue-600 hover:bg-blue-700">Guardar</Button></div>
    </form></DialogContent></Dialog>);
};

const NewYearDialog = ({ open, onOpenChange, onAdd }) => {
    const [year, setYear] = useState(new Date().getFullYear() + 1);
    const handleSubmit = (e) => { e.preventDefault(); onAdd(year.toString()); };
    return(
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Añadir Nuevo Año de Inventario</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-1"><Label htmlFor="new-year">Año</Label><input id="new-year" type="number" value={year} onChange={e => setYear(e.target.value)} className="w-full p-2 border rounded-lg" placeholder="Ej: 2025" /></div>
                    <div className="flex justify-end gap-2 pt-4"><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose><Button type="submit" className="bg-blue-600 hover:bg-blue-700">Añadir Año</Button></div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

const ImportDialog = ({ open, onOpenChange, onImport }) => {
    const [file, setFile] = useState(null);
    const { toast } = useToast();
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile && (selectedFile.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || selectedFile.type === 'application/vnd.ms-excel')) {
            setFile(selectedFile);
        } else {
            toast({ variant: 'destructive', title: 'Archivo no válido', description: 'Por favor, selecciona un archivo Excel (.xlsx).' });
        }
    };

    const handleImportClick = () => {
        if (!file) {
            toast({ variant: 'destructive', title: 'No hay archivo', description: 'Por favor, selecciona un archivo para importar.' });
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);

                const requiredHeaders = ['Nombre del Activo', 'Valor Total', 'Cantidad'];
                const headers = Object.keys(json[0] || {});
                
                const valColumn = headers.find(h => h.includes('Valor'));
                
                if (!headers.includes('Nombre del Activo') || !valColumn) {
                    toast({ variant: 'destructive', title: 'Formato incorrecto', description: `El archivo debe contener las columnas: Nombre del Activo, Valor Total.` });
                    return;
                }

                const assets = json.map(row => ({
                    name: row['Nombre del Activo'],
                    value: parseFloat(row[valColumn]),
                    quantity: parseInt(row['Cantidad']) || 1,
                    model: row['Marca/Modelo/Serie'] || '',
                    category: row['Categoría'] || '',
                    usage: row['Uso'] || 'Uso',
                    status: row['Estado'] || 'Bueno',
                    location: row['Lugar'] || '',
                    notes: row['Observaciones'] || '',
                }));

                onImport(assets);
                setFile(null);
                if(fileInputRef.current) fileInputRef.current.value = '';

            } catch (error) {
                toast({ variant: 'destructive', title: 'Error al procesar', description: 'No se pudo leer el archivo Excel. Asegúrate de que el formato sea correcto.' });
            }
        };
        reader.readAsArrayBuffer(file);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Importar Activos Fijos desde Excel</DialogTitle>
                    <DialogDescription>
                        Selecciona un archivo .xlsx. Asegúrate de que tenga las columnas: 'Nombre del Activo', 'Valor Total', 'Cantidad'. El Valor Total se sumará tal cual viene.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="file-upload">Archivo Excel</Label>
                    <input id="file-upload" ref={fileInputRef} type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="mt-2 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                </div>
                <div className="flex justify-end gap-2">
                    <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                    <Button onClick={handleImportClick}><Upload className="w-4 h-4 mr-2" /> Importar</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default FixedAssets;