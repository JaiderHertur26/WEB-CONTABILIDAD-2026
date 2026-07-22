import React from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { numberToWords } from '@/lib/numberToWords';
import { parseISO, format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

const VoucherContent = ({ transaction }) => {
  const { activeCompany, companies } = useCompany();

  if (!transaction || !activeCompany) return <div className="p-8 text-center text-slate-500">Cargando datos...</div>;

  // Determine which company this transaction belongs to
  const transactionCompanyId = transaction._companyId || activeCompany.id;
  const company = companies.find(c => c.id === transactionCompanyId) || activeCompany;

  // Buscamos los contactos usando la llave exacta de tu sistema
  const contacts = JSON.parse(localStorage.getItem(`${company.id}-contacts`) || '[]');

  const getDisplayName = () => {
    // 1. Buscamos si la transacción tiene un contactId guardado
    if (transaction.contactId) {
      const foundContact = contacts.find(c => c.id === transaction.contactId);
      if (foundContact) return foundContact.name;
    }

    // 2. Si la transacción ya traía el nombre directamente
    if (transaction.contact && typeof transaction.contact === 'string' && transaction.contact.trim() !== '') {
      return transaction.contact;
    }

    // 3. Si es movimiento interno
    if (transaction.isInternalTransfer || transaction.type === 'transfer' || transaction.type === 'adjustment') {
      return 'MOVIMIENTO INTERNO';
    }

    // 4. Fallback
    return 'VARIOS';
  };

  const displayName = getDisplayName();
  
  // Load necessary data for account resolution
  const accounts = JSON.parse(localStorage.getItem(`${company.id}-accounts`) || '[]');
  const bankAccounts = JSON.parse(localStorage.getItem(`${company.id}-bankAccounts`) || '[]');
  const initialBalances = JSON.parse(localStorage.getItem(`${company.id}-initialBalance`) || '[]');

  // --- ACCOUNT RESOLUTION LOGIC ---
  const getAccountDetails = () => {
    if (!transaction.isInternalTransfer) {
        const acc = accounts.find(a => a.name === transaction.category);
        if (acc) return { code: acc.number, name: acc.name };
        
        if (transaction.type === 'income') return { code: '4105', name: transaction.category || 'INGRESO' };
        return { code: '5105', name: transaction.category || 'GASTO' };
    }

    const destinationStr = transaction.destination || '';
    const [id, name] = destinationStr.split('|');
    const categoryName = (transaction.category || '').toUpperCase();

    if (id === 'caja_principal' || (name && name.toUpperCase().includes('CAJA'))) {
        const defaultCash = (initialBalances && initialBalances.length > 0) ? initialBalances[0] : null;
        return {
            code: defaultCash?.accountingCode || '11050501',
            name: defaultCash?.accountingName || 'CAJA PRINCIPAL'
        };
    }

    if (id === '12950501' || 
        (name && name.toUpperCase().includes('APORTES COOPERATIVA')) ||
        (categoryName && (categoryName.includes('APORTES COOPERATIVA') || categoryName.includes('12950501')))
    ) {
        return { code: '12950501', name: 'APORTES COOPERATIVA FRATERNIDAD' };
    }

    const bank = bankAccounts.find(b => b.id === id);
    if (bank) {
        return { 
            code: bank.accountingCode || '1110', 
            name: bank.accountingConcept || bank.bankName 
        };
    }

    if (/^\d+$/.test(id) && id.length >= 4) {
        return { code: id, name: name || 'CUENTA DESTINO' };
    }

    return { code: '', name: transaction.category || 'TRANSFERENCIA' };
  };

  const accountDetails = getAccountDetails();

  // Date Formatting
  const dateObj = parseISO(transaction.date);
  const formattedDate = isValid(dateObj) ? format(dateObj, 'dd/MM/yyyy', { locale: es }) : 'Fecha inválida';
  const day = isValid(dateObj) ? dateObj.getDate() : '--';
  const month = isValid(dateObj) ? format(dateObj, 'MMMM', { locale: es }).toUpperCase() : '----';
  const year = isValid(dateObj) ? dateObj.getFullYear() : '----';

  const amount = transaction.amount ? parseFloat(transaction.amount) : 0;
  const amountInWords = numberToWords(amount);
  
  let voucherType = '';
  let voucherPrefix = '';
  if(transaction.isInternalTransfer) {
      voucherType = 'Transferencia';
      voucherPrefix = 'T';
  } else if (transaction.type === 'income') {
      voucherType = 'Ingreso';
      voucherPrefix = 'I';
  } else {
      voucherType = 'Egreso';
      voucherPrefix = 'E';
  }

  const voucherNumber = transaction.voucherNumber ? `${voucherPrefix}-${String(transaction.voucherNumber).padStart(4, '0')}` : 'N/A';

  return (
    <div className="p-4 bg-white font-sans text-xs flex flex-col justify-between" style={{ width: '100%', height: '100%', border: '1px solid #000' }}>
      <div>
        <header className="flex justify-between items-start pb-2 mb-2 border-b-2 border-black">
          <div className="w-2/3 text-center">
            <h1 className="font-bold text-base uppercase">{company.name || 'NOMBRE EMPRESA'}</h1>
            <p>{company.name || 'NOMBRE EMPRESA'}</p>
            <p>NIT: {company.nit || company.doc || 'NIT EMPRESA'}</p>
            <p>{company.address || 'DIRECCIÓN EMPRESA'} - Tel: {company.phone || 'TELÉFONO'}</p>
          </div>
          <div className="w-1/3">
            <table className="text-xs border-collapse w-full" style={{border: '1px solid black'}}>
              <tbody>
                <tr><td className="font-bold p-1 bg-gray-200" style={{border: '1px solid black'}}>FECHA REGISTRO:</td><td className="p-1 text-center" style={{border: '1px solid black'}}>{formattedDate}</td></tr>
                <tr><td className="font-bold p-1 bg-gray-200" style={{border: '1px solid black'}}>N° COMPROBANTE:</td><td className="font-bold text-red-600 text-center p-1" style={{border: '1px solid black'}}>{voucherNumber}</td></tr>
              </tbody>
            </table>
          </div>
        </header>

        <section className="flex justify-between items-center my-2">
            <div className="w-2/3">
                <p className="font-bold text-base text-center bg-gray-200 p-1" style={{border: '1px solid black'}}>COMPROBANTE DE {voucherType.toUpperCase()}</p>
            </div>
            <div className="w-1/3 pl-2">
                <table className="text-xs border-collapse w-full" style={{border: '1px solid black'}}>
                    <thead><tr><th className="font-bold bg-gray-200 p-1" style={{border: '1px solid black'}}>DÍA</th><th className="font-bold bg-gray-200 p-1" style={{border: '1px solid black'}}>MES</th><th className="font-bold bg-gray-200 p-1" style={{border: '1px solid black'}}>AÑO</th></tr></thead>
                    <tbody><tr><td className="text-center p-1" style={{border: '1px solid black'}}>{String(day).padStart(2,'0')}</td><td className="text-center p-1" style={{border: '1px solid black'}}>{month}</td><td className="text-center p-1" style={{border: '1px solid black'}}>{year}</td></tr></tbody>
                </table>
            </div>
        </section>

        <section className="flex">
          <div className="w-3/4 pr-2">
            <table className="w-full text-xs border-collapse" style={{border: '1px solid black'}}>
              <tbody>
                <tr>
                    <td className="font-bold p-1 w-1/4" style={{border: '1px solid black'}}>
                        {transaction.type === 'income' ? 'RECIBO DE:' : 'PAGADO A:'}
                    </td>
                    <td className="p-1 uppercase font-semibold" style={{border: '1px solid black'}}>
                        {displayName}
                    </td>
                </tr>
                <tr><td className="font-bold p-1" style={{border: '1px solid black'}}>CONCEPTO:</td><td className="p-1" style={{border: '1px solid black'}}>{transaction.description}</td></tr>
                <tr><td className="font-bold p-1" style={{border: '1px solid black'}}>SUMA:</td><td className="uppercase p-1" style={{border: '1px solid black'}}>{amountInWords} PESOS</td></tr>
              </tbody>
            </table>
          </div>
          <div className="w-1/4">
            <table className="w-full h-full text-xs border-collapse" style={{border: '1px solid black'}}>
                <tbody>
                    <tr><td className="font-bold text-center bg-gray-200 p-1" style={{border: '1px solid black'}}>VALOR:</td></tr>
                    <tr><td className="font-bold text-lg text-center align-middle p-1">$ {amount.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td></tr>
                </tbody>
            </table>
          </div>
        </section>

        <section className="mt-2">
            <table className="w-full text-xs border-collapse" style={{border: '1px solid black'}}>
                <thead><tr><th className="font-bold bg-gray-200 p-1" style={{border: '1px solid black'}}>CÓDIGO</th><th className="font-bold bg-gray-200 p-1" style={{border: '1px solid black'}}>CUENTA</th><th className="font-bold bg-gray-200 p-1" style={{border: '1px solid black'}}>DEBE</th><th className="font-bold bg-gray-200 p-1" style={{border: '1px solid black'}}>HABER</th></tr></thead>
                <tbody>
                    {transaction.debitAccount && transaction.creditAccount ? (
                        <>
                            <tr>
                                <td className="p-1 text-center" style={{border: '1px solid black'}}>{transaction.debitAccount.code}</td>
                                <td className="p-1 uppercase" style={{border: '1px solid black'}}>{transaction.debitAccount.name}</td>
                                <td className="p-1 text-right" style={{border: '1px solid black'}}>{amount.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</td>
                                <td className="p-1 text-right" style={{border: '1px solid black'}}>0.00</td>
                            </tr>
                            <tr>
                                <td className="p-1 text-center" style={{border: '1px solid black'}}>{transaction.creditAccount.code}</td>
                                <td className="p-1 uppercase" style={{border: '1px solid black'}}>{transaction.creditAccount.name}</td>
                                <td className="p-1 text-right" style={{border: '1px solid black'}}>0.00</td>
                                <td className="p-1 text-right" style={{border: '1px solid black'}}>{amount.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</td>
                            </tr>
                        </>
                    ) : (
                        <>
                            <tr>
                                <td className="p-1 text-center" style={{border: '1px solid black'}}>{accountDetails.code || ''}</td>
                                <td className="p-1 uppercase" style={{border: '1px solid black'}}>{accountDetails.name || ''}</td>
                                <td className="p-1 text-right" style={{border: '1px solid black'}}>{transaction.type === 'income' ? amount.toLocaleString('es-CO', { minimumFractionDigits: 2 }) : '0.00'}</td>
                                <td className="p-1 text-right" style={{border: '1px solid black'}}>{transaction.type === 'expense' ? amount.toLocaleString('es-CO', { minimumFractionDigits: 2 }) : '0.00'}</td>
                            </tr>
                             {transaction.isInternalTransfer && (
                                 <tr>
                                    <td colSpan="2" className="p-1 font-bold text-right">Contrapartida:</td>
                                    <td className="p-1 text-right" style={{border: '1px solid black'}}>{transaction.type === 'expense' ? amount.toLocaleString('es-CO', { minimumFractionDigits: 2 }) : '0.00'}</td>
                                    <td className="p-1 text-right" style={{border: '1px solid black'}}>{transaction.type === 'income' ? amount.toLocaleString('es-CO', { minimumFractionDigits: 2 }) : '0.00'}</td>
                                </tr>
                            )}
                        </>
                    )}
                </tbody>
            </table>
        </section>
      </div>

      <footer className="mt-4 flex justify-around items-end text-center">
        <div className="w-1/4"><div className="border-t-2 border-black pt-1 mx-2"><p className="font-bold">ELABORADO</p></div></div>
        <div className="w-1/4"><div className="border-t-2 border-black pt-1 mx-2"><p className="font-bold">APROBADO</p></div></div>
        <div className="w-1/4"><div className="border-t-2 border-black pt-1 mx-2"><p className="font-bold">CONTABILIZADO</p></div></div>
        <div className="w-1/4"><div className="border-t-2 border-black pt-1 mx-2"><p className="font-bold">FIRMA Y SELLO</p></div></div>
      </footer>
    </div>
  );
};

const Voucher = React.forwardRef(({ transaction }, ref) => {
    return (
      <div ref={ref}>
        <VoucherContent transaction={transaction} />
      </div>
    );
});

export default Voucher;