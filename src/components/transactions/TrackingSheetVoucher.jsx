import React from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const TrackingSheetVoucher = React.forwardRef(({ item, type }, ref) => {
  const { activeCompany } = useCompany();

  if (!item || !activeCompany) return <div className="p-8 text-center text-slate-500">Cargando datos...</div>;

  const isReceivable = type === 'receivable';
  const title = isReceivable ? 'HISTORIAL DE ABONOS - CUENTA POR COBRAR' : 'HISTORIAL DE ABONOS - CUENTA POR PAGAR';
  const entityLabel = isReceivable ? 'CLIENTE:' : 'PROVEEDOR:';
  const entityName = isReceivable ? item.customer : item.supplier;

  const internalPayments = item.internalPayments || [];
  const totalAmount = parseFloat(item.amount || 0);
  const totalPaid = internalPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const remaining = totalAmount - totalPaid;

  return (
    <div ref={ref} className="bg-white p-8 font-sans text-xs mx-auto shadow-none" style={{ width: '210mm', minHeight: '297mm' }}>
       <header className="flex justify-between items-start pb-4 mb-4 border-b-2 border-black">
          <div className="text-center w-full">
            <h1 className="font-bold text-lg uppercase">{activeCompany.name || 'NOMBRE EMPRESA'}</h1>
            <p>NIT: {activeCompany.doc || 'NIT EMPRESA'}</p>
            <p>{activeCompany.address || 'DIRECCIÓN EMPRESA'} - Tel: {activeCompany.phone || 'TELÉFONO'}</p>
          </div>
        </header>

        <div className="text-center mb-6">
            <h2 className="font-bold text-base bg-gray-200 p-2 border border-black">{title}</h2>
        </div>

        <div className="mb-6">
             <table className="w-full text-xs border-collapse" style={{border: '1px solid black'}}>
              <tbody>
                <tr>
                    <td className="font-bold p-2 border border-black w-1/4 bg-gray-50">{entityLabel}</td>
                    <td className="p-2 border border-black">{entityName}</td>
                    <td className="font-bold p-2 border border-black w-1/4 bg-gray-50">FECHA EMISIÓN:</td>
                    <td className="p-2 border border-black">{format(new Date(item.issueDate), 'dd/MM/yyyy', { locale: es })}</td>
                </tr>
                <tr>
                    <td className="font-bold p-2 border border-black bg-gray-50">DESCRIPCIÓN:</td>
                    <td className="p-2 border border-black" colSpan="3">{item.description}</td>
                </tr>
              </tbody>
            </table>
        </div>

        <div className="mb-6">
            <h3 className="font-bold mb-2 uppercase">Detalle de Movimientos</h3>
            <table className="w-full text-xs border-collapse" style={{border: '1px solid black'}}>
                <thead>
                    <tr className="bg-gray-100">
                        <th className="p-2 border border-black text-left w-1/4">FECHA</th>
                        <th className="p-2 border border-black text-left w-1/2">NOTA / CONCEPTO</th>
                        <th className="p-2 border border-black text-right w-1/4">MONTO ABONADO</th>
                    </tr>
                </thead>
                <tbody>
                    {internalPayments.length === 0 ? (
                         <tr><td colSpan="3" className="p-4 border border-black text-center italic text-gray-500">No hay abonos registrados a la fecha</td></tr>
                    ) : (
                        internalPayments.map((payment, idx) => (
                            <tr key={idx}>
                                <td className="p-2 border border-black">{format(new Date(payment.date), 'dd/MM/yyyy', { locale: es })}</td>
                                <td className="p-2 border border-black">{payment.note || 'Abono parcial'}</td>
                                <td className="p-2 border border-black text-right font-mono">${parseFloat(payment.amount).toLocaleString('es-CO', { minimumFractionDigits: 2 })}</td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>

         <div className="flex justify-end mb-12">
            <table className="w-1/2 text-xs border-collapse" style={{border: '1px solid black'}}>
                <tbody>
                    <tr>
                        <td className="font-bold p-2 border border-black bg-gray-50">MONTO ORIGINAL:</td>
                        <td className="p-2 border border-black text-right font-mono">${totalAmount.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr>
                        <td className="font-bold p-2 border border-black bg-blue-50">TOTAL ABONADO:</td>
                        <td className="p-2 border border-black text-right text-blue-700 font-bold font-mono">${totalPaid.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr>
                        <td className="font-bold p-2 border border-black bg-gray-200">SALDO PENDIENTE:</td>
                        <td className="p-2 border border-black text-right font-bold text-lg font-mono">${remaining.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        
         <div className="mt-auto pt-16 flex justify-around text-center">
             <div className="w-1/3">
                 <div className="border-t border-black mx-4 pt-2 font-bold">FIRMA {isReceivable ? 'RECIBIDO' : 'AUTORIZADO'}</div>
             </div>
             <div className="w-1/3">
                 <div className="border-t border-black mx-4 pt-2 font-bold">FIRMA {isReceivable ? 'CLIENTE' : 'PROVEEDOR'}</div>
             </div>
         </div>
         
         <div className="mt-4 text-center text-gray-400 text-[10px]">
             Generado por Sistema Contable - {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })}
         </div>
    </div>
  );
});

export default TrackingSheetVoucher;