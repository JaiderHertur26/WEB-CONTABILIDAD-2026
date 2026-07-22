import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Printer, BadgeInfo } from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { exportToExcel } from '@/lib/excel';
import { useCompany } from '@/contexts/CompanyContext';

const InvoiceDetail = ({ invoice, company }) => {
    const printRef = useRef(null);
    const { activeCompany } = useCompany();

    const isPurchase = invoice.type === 'purchase' || invoice.type === 'expense';
    
    // Determine Issuer (Sender) and Recipient (Receiver)
    // Sales Invoice: Issuer = My Company, Recipient = Client
    // Purchase Invoice: Issuer = Supplier, Recipient = My Company
    const issuer = isPurchase ? (invoice.supplierData || {}) : (company || {});
    const recipient = isPurchase ? (company || {}) : (invoice.clientData || {});
    
    let docTitle = 'Documento';
    let recipientLabel = 'Cliente';

    if (invoice.type === 'purchase') {
        docTitle = 'Factura de Compra';
        recipientLabel = 'Comprador (Mi Empresa)';
    } else if (invoice.type === 'expense') {
        docTitle = 'Comprobante de Egreso';
        recipientLabel = 'Pagador (Mi Empresa)';
    } else if (invoice.type === 'sale') {
        docTitle = 'Factura de Venta';
        recipientLabel = 'Cliente';
    } else if (invoice.type === 'income') {
        docTitle = 'Comprobante de Ingreso';
        recipientLabel = 'Pagador (Cliente)';
    }
    
    const handlePrintPDF = async () => {
        if (!printRef.current) return;
        
        try {
            // Improved html2canvas options for better rendering
            const canvas = await html2canvas(printRef.current, { 
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff'
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`${docTitle.replace(/\s+/g, '_')}_${invoice.invoiceNumber}.pdf`);
        } catch (error) {
            console.error('Error generating PDF:', error);
        }
    };

    const handleExportExcel = () => {
        const data = invoice.items.map(item => ({
            'Documento': invoice.invoiceNumber,
            'Fecha': format(new Date(item.date), 'dd/MM/yyyy'),
            'Producto/Servicio': item.productName || item.description,
            'Cantidad': item.productQuantity || 1,
            'Precio Unitario': ((parseFloat(item.amount) / (item.productQuantity || 1))).toLocaleString('es-CO'),
            'Total': parseFloat(item.amount)
        }));
        
        // Add footer for total
        data.push({});
        data.push({ 'Producto/Servicio': 'TOTAL DOCUMENTO', 'Total': parseFloat(invoice.total) });

        exportToExcel(data, `${docTitle.replace(/\s+/g, '_')}_${invoice.invoiceNumber}`);
    };

    if (!invoice) return null;

    // Determine the NIT/DOC to display for the issuer
    const issuerDocDisplay = (issuer === company) 
        ? (activeCompany?.doc || 'No registrado') 
        : (issuer.nit || issuer.docNumber || 'No registrado');

    return (
        <div className="flex flex-col gap-4">
            <div className="flex justify-end gap-2 print:hidden">
                <Button variant="outline" size="sm" onClick={handleExportExcel}>
                    <Download className="w-4 h-4 mr-2" /> Excel
                </Button>
                <Button size="sm" onClick={handlePrintPDF}>
                    <Printer className="w-4 h-4 mr-2" /> Descargar PDF
                </Button>
            </div>

            <div ref={printRef} className="bg-white p-8 border rounded-lg shadow-sm min-h-[800px] text-sm text-slate-800 relative">
                {/* Header (Issuer Info) */}
                <div className="flex justify-between items-start mb-8 border-b pb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 mb-1">{issuer.name || 'Empresa'}</h1>
                        <p className="text-slate-500">NIT/DOC: {issuerDocDisplay}</p>
                        <p className="text-slate-500 max-w-[250px]">{issuer.address || 'Dirección no registrada'}</p>
                        {issuer.phone && <p className="text-slate-500">Tel: {issuer.phone}</p>}
                    </div>
                    {/* Changed from block/text-right to flex-col/items-end for better PDF rendering */}
                    <div className="flex flex-col items-end text-right">
                        <div className={`px-4 py-2 rounded-lg mb-2 w-fit min-w-[180px] text-center ${isPurchase ? 'bg-orange-100' : 'bg-slate-100'}`}>
                            <span className={`block text-xs font-semibold uppercase tracking-wider ${isPurchase ? 'text-orange-700' : 'text-slate-500'}`}>{docTitle}</span>
                            <span className={`block text-xl font-bold ${isPurchase ? 'text-orange-700' : 'text-blue-600'}`}>{invoice.invoiceNumber || '---'}</span>
                        </div>
                        <p className="text-slate-600">Fecha de Emisión: <strong>{format(new Date(invoice.createdAt), 'dd/MM/yyyy')}</strong></p>
                        {invoice.sourceType === 'transaction' && (
                            <p className="text-xs text-indigo-500 font-semibold mt-1 flex justify-end items-center gap-1">
                                <BadgeInfo className="w-3 h-3" /> Generado desde Transacción
                            </p>
                        )}
                    </div>
                </div>

                {/* Recipient Info */}
                <div className="bg-slate-50 p-6 rounded-lg mb-8 border border-slate-100">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{recipientLabel}</h3>
                    <div className="grid grid-cols-2 gap-8">
                        <div>
                            <p className="font-bold text-lg text-slate-900">{recipient.name || 'General'}</p>
                            <p className="text-slate-600">{recipient.docType || 'NIT'} {recipient.docNumber || recipient.nit}</p>
                            {recipient.address && <p className="text-slate-500">{recipient.address}</p>}
                            {recipient.phone && <p className="text-slate-500">{recipient.phone}</p>}
                        </div>
                        <div className="text-right">
                            <p className="text-slate-500 text-xs uppercase mb-1">Periodo / Referencia</p>
                            <p className="font-medium text-slate-700">{invoice.dateRange || 'N/A'}</p>
                        </div>
                    </div>
                </div>

                {/* Items Table */}
                <table className="w-full mb-8">
                    <thead>
                        <tr className="border-b-2 border-slate-900">
                            <th className="py-3 text-left font-bold text-slate-900">Fecha</th>
                            <th className="py-3 text-left font-bold text-slate-900">Descripción</th>
                            <th className="py-3 text-center font-bold text-slate-900">Cant.</th>
                            <th className="py-3 text-right font-bold text-slate-900">Precio Unit.</th>
                            <th className="py-3 text-right font-bold text-slate-900">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {invoice.items.map((item, index) => {
                            const qty = parseFloat(item.productQuantity) || 1;
                            const total = parseFloat(item.amount);
                            const unitPrice = total / qty;
                            
                            return (
                                <tr key={index}>
                                    <td className="py-3 text-slate-600">{format(new Date(item.date), 'dd/MM/yyyy')}</td>
                                    <td className="py-3 font-medium text-slate-800">{item.productName || item.description}</td>
                                    <td className="py-3 text-center text-slate-600">{qty}</td>
                                    <td className="py-3 text-right text-slate-600 font-mono">${unitPrice.toLocaleString('es-CO', {minimumFractionDigits: 0})}</td>
                                    <td className="py-3 text-right font-bold text-slate-800 font-mono">${total.toLocaleString('es-CO', {minimumFractionDigits: 0})}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* Totals */}
                <div className="flex justify-end mb-12">
                    <div className="w-64 space-y-3">
                        <div className="flex justify-between text-slate-600">
                            <span>Subtotal</span>
                            <span className="font-mono">${parseFloat(invoice.total).toLocaleString('es-CO', {minimumFractionDigits: 0})}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                            <span>Impuestos (0%)</span>
                            <span className="font-mono">$0</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-200 pt-3 text-lg font-bold text-slate-900">
                            <span>Total General</span>
                            <span className="font-mono">${parseFloat(invoice.total).toLocaleString('es-CO', {minimumFractionDigits: 0})}</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="absolute bottom-8 left-8 right-8 text-center text-slate-400 text-xs border-t pt-4">
                    <p>Documento generado electrónicamente.</p>
                    <p className="mt-1">Gracias por su {isPurchase ? 'gestión' : 'compra'}.</p>
                </div>
            </div>
        </div>
    );
};

export default InvoiceDetail;