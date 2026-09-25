import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Download, FileText, Search, BookMarked, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { exportToExcel, exportProfessionalTable, exportProfessionalWorkbook } from '@/lib/excel';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { getDynamicCashAccounts } from '@/lib/cashAccountUtils';
import { expandTransactionsByAllocation } from '@/lib/transactionAllocations';
import { calculateLiquidityBalances } from '@/lib/financialMovements';
import { getOpenItemDate, getOutstandingBalance } from '@/lib/outstandingBalance';
import ContractTaxAlert from '@/components/contracts/ContractTaxAlert';
import { getRetentionDueDate } from '@/lib/contractTaxEngine';
import { getCompanyScopeIds } from '@/lib/companyHierarchy';
import ProfessionalModuleHero from '@/components/layout/ProfessionalModuleHero';
import { summarizePatrimonialAtCutoff, PATRIMONIAL_ASSET_TYPES } from '@/lib/patrimonialAssets';

const TaxReports = () => {
    const { activeCompany, companies, isConsolidated } = useCompany();

    const [transactions, , isTransactionsLoaded] = useCompanyData('transactions');
    const [contacts, , isContactsLoaded] = useCompanyData('contacts');
    const [accounts, , isAccountsLoaded] = useCompanyData('accounts');
    const [fixedAssets, , isFixedAssetsLoaded] = useCompanyData('fixedAssets');
    const [realEstates, , isRealEstatesLoaded] = useCompanyData('realEstates');
    const [accountsReceivable, , isARLoaded] = useCompanyData('accountsReceivable');
    const [accountsPayable, , isAPLoaded] = useCompanyData('accountsPayable');
    const [bankAccounts, , isBankAccountsLoaded] = useCompanyData('bankAccounts');
    const [initialBalance, , isInitialBalanceLoaded] = useCompanyData('initialBalance');
    const [cashAccounts, , isCashAccountsLoaded] = useCompanyData('cash_accounts');
    const [inventory, , isInventoryLoaded] = useCompanyData('inventory');
    const [contracts] = useCompanyData('contracts');

    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const { toast } = useToast();

    // HELPER PARA EVITAR EL BUG DE ZONA HORARIA
    const getSafeYear = (dateStr) => {
        if (!dateStr) return 0;
        if (typeof dateStr === 'string' && dateStr.includes('-')) {
            return parseInt(dateStr.split('-')[0], 10);
        }
        return new Date(dateStr).getFullYear();
    };

    const companyScopeIds = useMemo(
        () => getCompanyScopeIds(companies, activeCompany?.id),
        [companies, activeCompany?.id]
    );

    const filterByCompany = useMemo(() => (items) => {
        if (!items) return [];
        return items.filter(item => {
            const cid = item.company_id || item._companyId || item.companyId;
            if (!isConsolidated) return !cid || String(cid) === String(activeCompany?.id);
            return !cid || companyScopeIds.has(String(cid));
        });
    }, [isConsolidated, activeCompany, companyScopeIds]);

    const areAllDataLoaded = useMemo(() => 
        isTransactionsLoaded && 
        isContactsLoaded && 
        isAccountsLoaded && 
        isFixedAssetsLoaded && 
        isRealEstatesLoaded && 
        isARLoaded && 
        isAPLoaded && 
        isBankAccountsLoaded && 
        isInitialBalanceLoaded && 
        isCashAccountsLoaded &&
        isInventoryLoaded, 
    [isTransactionsLoaded, isContactsLoaded, isAccountsLoaded, isFixedAssetsLoaded, isRealEstatesLoaded, isARLoaded, isAPLoaded, isBankAccountsLoaded, isInitialBalanceLoaded, isCashAccountsLoaded, isInventoryLoaded]);

    const availableYears = useMemo(() => {
        const validTransactions = filterByCompany(transactions || []).filter(t => 
            !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(t.status?.toLowerCase())
        );
        const years = new Set(validTransactions.map(t => getSafeYear(t.date)));
        const currentYear = new Date().getFullYear();
        years.add(currentYear);
        return Array.from(years).sort((a, b) => b - a).map(String);
    }, [transactions, filterByCompany]);
    
    const contractTaxRows = useMemo(() => (contracts || []).flatMap(contract => (contract.acts || [])
        .filter(act => act.status !== 'Anulada' && String(act.date || '').startsWith(selectedYear) && Number(act.tax?.totalWithholdings || 0) > 0)
        .map(act => ({
            contract: contract.number,
            contractor: contract.contractorName,
            act: act.number,
            date: act.date,
            base: Number(act.tax?.base || act.grossValue || 0),
            retefuente: Number(act.tax?.incomeWithholding || 0),
            reteiva: Number(act.tax?.reteIva || 0),
            reteica: Number(act.tax?.reteIca || 0),
            total: Number(act.tax?.totalWithholdings || 0),
            dueDate: getRetentionDueDate(act.date, activeCompany?.doc),
            status: act.taxStatus === 'paid' ? 'Declarada / pagada' : 'Pendiente'
        }))), [contracts, selectedYear, activeCompany]);

    const handleExportContractTaxes = () => {
        if (!contractTaxRows.length) { toast({ variant: 'destructive', title: 'Sin retenciones contractuales', description: 'No hay registros para el año seleccionado.' }); return; }
        exportToExcel(contractTaxRows.map(r => ({
            'Contrato': r.contract, 'Contratista': r.contractor, 'Acta': r.act, 'Fecha': r.date,
            'Base': r.base, 'Retefuente': r.retefuente, 'ReteIVA': r.reteiva, 'ReteICA': r.reteica,
            'Total Retenido': r.total, 'Vencimiento DIAN': r.dueDate || '', 'Estado': r.status
        })), 'Retenciones_Contratos_' + selectedYear);
    };

    const safeParseFloat = (value) => { const parsed = parseFloat(value); return isNaN(parsed) ? 0 : parsed; };

    // ============================================================================
    // --- LÓGICA DE EXÓGENA ---
    // ============================================================================
    const generateExogenaData = useMemo(() => {
        if (!areAllDataLoaded) return [];
        const paymentsByContact = {};
        const fContacts = filterByCompany(contacts || []);

        const yearTransactions = filterByCompany(transactions).filter(t => 
            getSafeYear(t.date).toString() === selectedYear &&
            !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(t.status?.toLowerCase())
        );
        
        yearTransactions.forEach(t => {
            if (t.type === 'expense' && !t.isInternalTransfer && t.contactId) {
                const contactId = t.contactId;
                if (!paymentsByContact[contactId]) {
                    const contactInfo = fContacts.find(c => c.id === contactId);
                    if (contactInfo) paymentsByContact[contactId] = { ...contactInfo, total: 0, movementCount: 0 };
                }
                if (paymentsByContact[contactId]) {
                    paymentsByContact[contactId].total += safeParseFloat(t.amount);
                    paymentsByContact[contactId].movementCount += 1;
                }
            }
        });
        return Object.values(paymentsByContact).map(contact => ({
            'Tipo Doc.': contact.docType,
            'Número Doc.': contact.docNumber,
            'Nombre o Razón Social': contact.name,
            'Categoría': contact.category || 'Cliente',
            'Dirección': contact.address || '',
            'Teléfono': contact.phone,
            'Email': contact.email,
            'Tipo Contacto': contact.type === 'company' ? 'Empresa' : 'Persona',
            'Movimientos': contact.movementCount || 0,
            'Pago o Abono en Cuenta': contact.total
        }));
    }, [transactions, contacts, selectedYear, areAllDataLoaded, filterByCompany]);

    const handleExportExogena = () => {
        const data = generateExogenaData;
        if (data.length === 0) { toast({ variant: 'destructive', title: "No hay datos para exportar" }); return; }

        const total = data.reduce((sum, item) => sum + Number(item['Pago o Abono en Cuenta'] || 0), 0);
        const yearTransactions = filterByCompany(transactions).filter(t =>
            getSafeYear(t.date).toString() === selectedYear &&
            !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(t.status?.toLowerCase())
        );
        const missingThirdParty = yearTransactions.filter(t =>
            t.type === 'expense' && !t.isInternalTransfer && !t.contactId
        );
        const missingThirdPartyTotal = missingThirdParty.reduce(
            (sum, t) => sum + safeParseFloat(t.amount),
            0
        );

        exportProfessionalTable({
            fileName: `Reporte_Exogena_${selectedYear}`,
            companyName: activeCompany?.name || 'ENTIDAD CONTABLE',
            nit: activeCompany?.doc || '',
            title: 'PAGOS A TERCEROS · BASE DE REVISIÓN DE INFORMACIÓN EXÓGENA',
            period: `AÑO FISCAL ${selectedYear}`,
            sheetName: 'Pagos a Terceros',
            orientation: 'landscape',
            columns: [
                { key: 'Tipo Doc.', label: 'TIPO DOC.', width: 12, type: 'text' },
                { key: 'Número Doc.', label: 'NÚMERO DOC.', width: 18, type: 'text' },
                { key: 'Nombre o Razón Social', label: 'NOMBRE O RAZÓN SOCIAL', width: 36, type: 'text' },
                { key: 'Categoría', label: 'CATEGORÍA', width: 15, type: 'text' },
                { key: 'Tipo Contacto', label: 'TIPO TERCERO', width: 15, type: 'text' },
                { key: 'Movimientos', label: 'MOV.', width: 9, type: 'integer' },
                { key: 'Dirección', label: 'DIRECCIÓN', width: 32, type: 'text' },
                { key: 'Teléfono', label: 'TELÉFONO', width: 16, type: 'text' },
                { key: 'Email', label: 'EMAIL', width: 30, type: 'text' },
                { key: 'Pago o Abono en Cuenta', label: 'PAGO O ABONO EN CUENTA', width: 22, type: 'currency' }
            ],
            rows: data,
            summaryRows: [{
                'Nombre o Razón Social': 'TOTAL PAGOS / ABONOS',
                'Pago o Abono en Cuenta': total,
                __style: 'total'
            }],
            notes: [
                'Base contable de revisión; no sustituye los formatos oficiales de información exógena ni acredita presentación ante la DIAN.',
                'Los datos de identificación provienen del maestro de terceros registrado en el sistema.',
                missingThirdParty.length === 0
                    ? 'Control de integridad: no se detectaron egresos operativos sin tercero asociado en la vigencia.'
                    : `ALERTA DE INTEGRIDAD: ${missingThirdParty.length} egreso(s) operativo(s) por ${missingThirdPartyTotal.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })} no tienen tercero asociado y no están incluidos en esta base.`
            ]
        });
        toast({
            title: missingThirdParty.length > 0 ? 'Excel generado con alerta de integridad' : 'Excel profesional generado',
            description: missingThirdParty.length > 0
                ? `Hay ${missingThirdParty.length} egreso(s) operativo(s) sin tercero asociado. Revise la nota del reporte.`
                : `Reporte de pagos a terceros ${selectedYear} generado y conciliado en integridad de terceros.`
        });
    };

    // ============================================================================
    // --- LÓGICA DE RENTA (TAX RETURN) CLONADA AL 100% DE REPORTS.JSX ---
    // ============================================================================
    const generateRentaData = useMemo(() => {
        if (!areAllDataLoaded) return [];

        const fTransactions = filterByCompany(transactions);
        const fInitialBalance = filterByCompany(initialBalance);
        const fCashAccounts = filterByCompany(cashAccounts);
        const fBankAccounts = filterByCompany(bankAccounts);
        const fFixedAssets = filterByCompany(fixedAssets);
        const fRealEstates = filterByCompany(realEstates);
        const fAccountsReceivable = filterByCompany(accountsReceivable);
        const fAccountsPayable = filterByCompany(accountsPayable);
        const fInventory = filterByCompany(inventory);

        const uniqueAccountsMap = new Map();
        (accounts || []).forEach(acc => {
            if (!acc || !acc.name) return;
            const exactName = String(acc.name).trim().toUpperCase();
            if (!uniqueAccountsMap.has(exactName)) uniqueAccountsMap.set(exactName, acc);
        });
        const allAccounts = Array.from(uniqueAccountsMap.values());
        const currentYear = selectedYear;
        const now = new Date();
        const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const taxCutoffDate = currentYear === String(now.getFullYear()) ? todayKey : `${currentYear}-12-31`;

        const baseValidTransactions = fTransactions.filter(t => 
            !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(t.status?.toLowerCase())
        );
        const validTransactions = expandTransactionsByAllocation(baseValidTransactions);

        const pnlTransactions = validTransactions.filter(t => getSafeYear(t.date).toString() === currentYear);
        const bsTransactions = validTransactions.filter(t => getSafeYear(t.date) <= parseInt(currentYear));

        const getAccountCreationYear = (accountId, defaultDate) => {
            if (defaultDate) return getSafeYear(defaultDate);
            
            const accountTransactions = validTransactions.filter(t => 
                t.destination?.startsWith(accountId) || 
                t.fromAccount?.startsWith(accountId) || 
                t.toAccount?.startsWith(accountId) ||
                (t.debitAccount && t.debitAccount.code === accountId) ||
                (t.creditAccount && t.creditAccount.code === accountId)
            );
            
            if (accountTransactions.length > 0) {
                const oldestDate = accountTransactions.reduce((min, t) => t.date < min ? t.date : min, accountTransactions[0].date);
                return getSafeYear(oldestDate);
            }
            return new Date().getFullYear();
        };

        const getAccountPrefix = (categoryName) => {
            const account = allAccounts.find(a => a.name === categoryName);
            return account ? String(account.number).charAt(0) : null;
        };
        
        // 1. P&L Logic (Blindada contra Gastos Ocultos)
        let totalIncomes = 0;
        let totalCosts = 0;
        let totalExpenses = 0;

        pnlTransactions.forEach(t => {
            const amount = safeParseFloat(t.amount);
            if (amount === 0) return;

            if (t.debitAccount && t.creditAccount) {
                const drCode = String(t.debitAccount.code || '');
                const crCode = String(t.creditAccount.code || '');
                if (crCode.startsWith('4')) totalIncomes += amount;
                if (['6', '7'].includes(drCode.charAt(0))) totalCosts += amount;
                if (drCode.startsWith('5')) totalExpenses += amount;
            } else {
                if (t.isInternalTransfer || t.isFixedAsset || t.isPurchase) return;
                let prefix = getAccountPrefix(t.category);
                if (!prefix) prefix = t.type === 'income' ? '4' : (t.type === 'expense' ? '5' : null);
                
                if (prefix === '4') totalIncomes += (t.type === 'income' ? amount : -amount);
                else if (['6', '7'].includes(prefix)) totalCosts += (t.type === 'expense' ? amount : -amount);
                else if (prefix === '5') totalExpenses += (t.type === 'expense' ? amount : -amount);
            }
        });

        const totalCostsAndExpenses = totalCosts + totalExpenses;
        const netProfit = totalIncomes - totalCostsAndExpenses;

        // 2. Balance Sheet Logic
        const cashAccountIds = new Set();
        cashAccountIds.add('caja_principal');
        if (allAccounts) { 
            allAccounts.forEach(acc => { 
                if (acc.number === '11050501' || acc.name.toUpperCase() === 'CAJA PRINCIPAL') { 
                    cashAccountIds.add(acc.id); 
                } 
            }); 
        }

        const isAccountMatch = (targetId, accountIdOrString) => {
            if (!accountIdOrString) return false;
            if (accountIdOrString === targetId) return true;
            if (accountIdOrString.startsWith(`${targetId}|`)) return true;
            if (targetId === 'caja_principal' && accountIdOrString.toLowerCase().includes('caja principal')) return true;
            return false;
        };

        // MOTOR ÚNICO DE LIQUIDEZ COMPARTIDO CON BALANCE/DASHBOARD.
        // Evita reclasificaciones distintas entre Caja, Bancos y Aportes.
        const liquidity = calculateLiquidityBalances({
            transactions: baseValidTransactions,
            initialBalances: fInitialBalance,
            bankAccounts: fBankAccounts,
            cashAccounts: fCashAccounts,
            accounts: allAccounts,
            cutoffDate: currentYear + '-12-31',
        });

        const cajaPrincipalBalance = liquidity.mainCash;
        const customCashBalance = liquidity.totalCustomCash;
        const totalCashBalance = liquidity.totalCash;
        const totalBankBalances = liquidity.totalBanks;
        const totalInvestmentBalances = liquidity.investments;
        const cajaGeneralValue = totalCashBalance + totalBankBalances + totalInvestmentBalances;

        const dynamicCashAccounts = fCashAccounts.map(acc => ({
            ...acc,
            balance: liquidity.customCash[String(acc.id)] || 0,
        }));

        let initialDepreciacion = 0, initialAnticipos = 0, initialConstrucciones = 0, initialOtherAssets = 0, initialOtherLiabilities = 0;
        
        fInitialBalance.forEach(item => {
            const itemYear = item.date ? getSafeYear(item.date) : new Date().getFullYear();
            if (itemYear <= parseInt(currentYear)) {
                const amount = safeParseFloat(item.balance);
                const code = String(item.accountingCode || '');
                
                if (code.startsWith('1592')) {
                    initialDepreciacion -= Math.abs(amount);
                } else if (code.startsWith('1330')) {
                    initialAnticipos += amount;
                } else if (code.startsWith('1508')) {
                    initialConstrucciones += amount;
                } else if (code.startsWith('1') && !code.startsWith('11') && !code.startsWith('1295') && !code.startsWith('1305') && !code.startsWith('14') && !code.startsWith('15')) {
                    initialOtherAssets += amount;
                } else if (code.startsWith('2') && !code.startsWith('2305')) {
                    initialOtherLiabilities += Math.abs(amount);
                }
            }
        });

        let anticiposValue = initialAnticipos;
        let construccionesValue = initialConstrucciones;
        let otherAssetsValue = initialOtherAssets;
        let otherLiabilitiesValue = initialOtherLiabilities;
        let legacyIntangiblesValue = 0;
        const isMasterIntangibleTransaction = t => Boolean(t?.isPatrimonialAsset || t?.isFixedAsset) && (
            t?.patrimonialAssetType === PATRIMONIAL_ASSET_TYPES.INTANGIBLE ||
            String(t?.fixedAssetAccountCode || '').startsWith('16')
        );

        fInitialBalance.forEach(item => {
            const itemYear = item.date ? getSafeYear(item.date) : new Date().getFullYear();
            if (itemYear <= parseInt(currentYear)) {
                const code = String(item.accountingCode || '');
                if (code.startsWith('16')) legacyIntangiblesValue += safeParseFloat(item.balance);
            }
        });

        bsTransactions.forEach(t => {
            const amount = safeParseFloat(t.amount);

            // Bloque Partida Doble Manual
            if (t.debitAccount && t.creditAccount) {
                if (String(t.id).endsWith('-inc')) return;
                const drCode = String(t.debitAccount.code || '');
                const crCode = String(t.creditAccount.code || '');

                if (drCode.startsWith('1330')) anticiposValue += amount;
                else if (drCode.startsWith('1508')) construccionesValue += amount;
                else if (drCode.startsWith('16') && !isMasterIntangibleTransaction(t)) legacyIntangiblesValue += amount;
                else if (drCode.startsWith('1') && !drCode.startsWith('11') && !drCode.startsWith('1295') && !drCode.startsWith('1305') && !drCode.startsWith('14') && !drCode.startsWith('15')) {
                    otherAssetsValue += amount;
                }
                else if (drCode.startsWith('2') && !drCode.startsWith('2305')) otherLiabilitiesValue -= amount;

                if (crCode.startsWith('1330')) anticiposValue -= amount;
                else if (crCode.startsWith('1508')) construccionesValue -= amount;
                else if (crCode.startsWith('16') && !isMasterIntangibleTransaction(t)) legacyIntangiblesValue -= amount;
                else if (crCode.startsWith('1') && !crCode.startsWith('11') && !crCode.startsWith('1295') && !crCode.startsWith('1305') && !crCode.startsWith('14') && !crCode.startsWith('15')) {
                    otherAssetsValue -= amount;
                }
                else if (crCode.startsWith('2') && !crCode.startsWith('2305')) otherLiabilitiesValue += amount;

                return;
            }

            // --- CUALQUIER TRANSACCIÓN (INCLUSO CRUCES CONTABLES) FLUYE POR AQUÍ ---
            const acc = allAccounts.find(a => a.name === t.category);
            if (!acc) return;
            const num = String(acc.number);

            const assetImpact = t.type === 'expense' ? amount : -amount;
            const liabilityImpact = t.type === 'income' ? amount : -amount;

            if (num.startsWith('1330')) anticiposValue += assetImpact;
            else if (num.startsWith('1508')) construccionesValue += assetImpact;
            else if (num.startsWith('16') && !isMasterIntangibleTransaction(t)) legacyIntangiblesValue += assetImpact;
            else if (num.startsWith('1') && !num.startsWith('11') && !num.startsWith('1295') && !num.startsWith('1305') && !num.startsWith('14') && !num.startsWith('15')) {
                otherAssetsValue += assetImpact;
            }
            else if (num.startsWith('2') && !num.startsWith('2305')) {
                otherLiabilitiesValue += liabilityImpact;
            }
        });

        const inventoryValue = fInventory.reduce((sum, p) => sum + ((parseFloat(p.quantity) || 0) * (parseFloat(p.unit_cost) || 0)), 0);
        
        const patrimonialSummary = summarizePatrimonialAtCutoff(
            fFixedAssets,
            fRealEstates,
            taxCutoffDate,
            baseValidTransactions
        );
        const manualFixedAssetsValue = patrimonialSummary.tangible.grossCost;
        const realEstatesValue = patrimonialSummary.realEstate.grossCost;
        const intangiblesValue = legacyIntangiblesValue + patrimonialSummary.intangible.grossCost;
        const totalDepreciacionInventario = patrimonialSummary.tangible.accumulatedDepreciation;
        const totalDepreciacionPropiedades = patrimonialSummary.realEstate.accumulatedDepreciation;
        const totalAmortizacionIntangibles = patrimonialSummary.intangible.accumulatedAmortization;
        const depreciacionAcumuladaValue = -Math.abs(totalDepreciacionInventario + totalDepreciacionPropiedades);
        const amortizacionAcumuladaValue = -Math.abs(totalAmortizacionIntangibles);

        const accountsReceivableValue = fAccountsReceivable.reduce((sum, r) => {
            const rDate = getOpenItemDate(r);
            const rYear = rDate ? getSafeYear(rDate) : (r.year ? parseInt(r.year) : parseInt(selectedYear));
            if (rYear > parseInt(selectedYear)) return sum;
            return sum + getOutstandingBalance(r, taxCutoffDate);
        }, 0);

        const accountsPayableValue = fAccountsPayable.reduce((sum, p) => {
            const pDate = getOpenItemDate(p);
            const pYear = pDate ? getSafeYear(pDate) : (p.year ? parseInt(p.year) : parseInt(selectedYear));
            if (pYear > parseInt(selectedYear)) return sum;
            return sum + getOutstandingBalance(p, taxCutoffDate);
        }, 0);

        const totalAssets = cajaGeneralValue + accountsReceivableValue + anticiposValue + otherAssetsValue + intangiblesValue + construccionesValue + realEstatesValue + manualFixedAssetsValue + inventoryValue + depreciacionAcumuladaValue + amortizacionAcumuladaValue;
        const totalDebts = accountsPayableValue + otherLiabilitiesValue;
        const netWorth = totalAssets - totalDebts;        

        const assetsSection = [
            { Concepto: 'TOTAL ACTIVOS CONTABLES (base para revisión fiscal)', Valor: totalAssets, isTotal: true },
            { Concepto: '  Efectivo y Equivalentes (Total Caja, Bancos y Aportes)', Valor: cajaGeneralValue, isSubtotal: true },
            { Concepto: '    Caja Principal', Valor: cajaPrincipalBalance, isDetail: true },
            ...dynamicCashAccounts.map(acc => ({ Concepto: `    ${acc.name}`, Valor: acc.balance, isDetail: true })),
            { Concepto: '    Cuentas Bancarias', Valor: totalBankBalances, isDetail: true },
            { Concepto: '    Aportes Ordinarios', Valor: totalInvestmentBalances, isDetail: true },
            { Concepto: '  Cuentas por Cobrar', Valor: accountsReceivableValue, isDetail: true },
            { Concepto: '  Anticipos a Proveedores', Valor: anticiposValue, isDetail: true },
            { Concepto: '  Otros Activos Corrientes', Valor: otherAssetsValue, isDetail: true },
            { Concepto: '  Activos Intangibles (Licencias)', Valor: intangiblesValue, isDetail: true },
            { Concepto: '  Construcciones en Curso', Valor: construccionesValue, isDetail: true },
            { Concepto: '  Propiedades, Planta y Equipo (inmuebles)', Valor: realEstatesValue, isDetail: true },
            { Concepto: '  Activos Fijos (costo histórico vigente al corte)', Valor: manualFixedAssetsValue, isDetail: true },
            { Concepto: '  Inventario', Valor: inventoryValue, isDetail: true },
            { Concepto: '    Depreciación acumulada de Activos Fijos', Valor: -Math.abs(totalDepreciacionInventario), isDetail: true },
            { Concepto: '    Depreciación acumulada de Propiedades/Inmuebles', Valor: -Math.abs(totalDepreciacionPropiedades), isDetail: true },
            { Concepto: '  TOTAL DEPRECIACIÓN ACUMULADA', Valor: depreciacionAcumuladaValue, isSubtotal: true },
            { Concepto: '  Amortización acumulada de Intangibles', Valor: amortizacionAcumuladaValue, isSubtotal: true },
        ];

        return [
            ...assetsSection,
            { Concepto: 'DEUDAS (Total Pasivos)', Valor: totalDebts, isTotal: true },
            { Concepto: '  Cuentas por Pagar', Valor: accountsPayableValue, isDetail: true },
            { Concepto: '  Otros Pasivos', Valor: otherLiabilitiesValue, isDetail: true },
            { Concepto: 'PATRIMONIO LÍQUIDO CONTABLE (Activos - Pasivos)', Valor: netWorth, isTotal: true }, 
            { isSpacer: true },
            { Concepto: 'INGRESOS TOTALES (P&L del año)', Valor: totalIncomes, isDetail: true },
            { Concepto: 'COSTOS Y GASTOS TOTALES (P&L del año)', Valor: totalCostsAndExpenses, isDetail: true },
            { Concepto: 'EXCEDENTE NETO CONTABLE DEL EJERCICIO', Valor: netProfit, isTotal: true },
        ];
    }, [transactions, bankAccounts, fixedAssets, realEstates, accountsReceivable, accountsPayable, accounts, initialBalance, cashAccounts, inventory, selectedYear, areAllDataLoaded, filterByCompany]);

    const handleExportRenta = () => {
        const data = generateRentaData;
        if (data.length === 0 || !areAllDataLoaded) { 
            toast({ variant: 'destructive', title: "No hay datos para exportar." }); 
            return; 
        }

        const rows = data.map(row => {
            if (row.isSpacer) return { Concepto: '', Valor: null, __style: 'note' };
            return {
                Concepto: row.Concepto ? String(row.Concepto).trim() : '',
                Valor: row.Valor != null ? Number(row.Valor) : null,
                __style: row.isTotal ? 'total' : (row.isSubtotal ? 'subtotal' : '')
            };
        });

        exportProfessionalTable({
            fileName: `Reporte_Contable_Renta_${selectedYear}`,
            companyName: activeCompany?.name || 'ENTIDAD CONTABLE',
            nit: activeCompany?.doc || '',
            title: 'REPORTE CONTABLE DE APOYO A DECLARACIÓN DE RENTA',
            period: `AÑO FISCAL ${selectedYear}`,
            sheetName: 'Renta',
            columns: [
                { key: 'Concepto', label: 'CONCEPTO / CUENTA', width: 62, type: 'text' },
                { key: 'Valor', label: 'VALOR (COP)', width: 22, type: 'currency' }
            ],
            rows,
            notes: [
                'Reporte de base contable para revisión tributaria. No sustituye el formulario oficial ni acredita presentación ante la DIAN.',
                'Los totales de activos, patrimonio y excedente aquí presentados son CONTABLES; la determinación fiscal requiere conciliación, depuración y ajustes conforme a las reglas tributarias aplicables.',
                'Las cifras deben revisarse con el contador, soportes y conciliaciones antes de cualquier presentación tributaria.',
                'Los saldos de Caja, Bancos y Aportes provienen del mismo motor de liquidez utilizado por el Balance General; Activos Fijos se determina por la existencia y depreciación histórica de cada bien a la fecha de corte.'
            ]
        });
        toast({ title: "Excel profesional generado", description: "Reporte contable de apoyo a Renta generado para revisión." });
    };
    
    return (
        <>
            <Helmet><title>Reportes Tributarios - JaiderHerTur26</title></Helmet>
            <div className="space-y-8">
                <ProfessionalModuleHero
                    eyebrow="Cumplimiento y soporte fiscal"
                    title="Reportes Tributarios"
                    subtitle="Consolida retenciones, pagos a terceros y cifras contables de apoyo para revisión tributaria."
                    activeCompany={activeCompany}
                    icon={FileText}
                    accent="amber"
                    metrics={[
                        { label: 'Año fiscal', value: selectedYear },
                        { label: 'Retenciones', value: contractTaxRows.length },
                        { label: 'Terceros', value: generateExogenaData.length },
                        { label: 'Estado', value: areAllDataLoaded ? 'Listo' : 'Cargando' },
                    ]}
                    actions={
                        <div className="col-span-2 flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 text-white sm:col-span-1">
                            <Calendar className="h-4 w-4 text-amber-200" />
                            <Label htmlFor="year-select" className="whitespace-nowrap text-xs font-bold text-slate-200">Año</Label>
                            <Select value={selectedYear} onValueChange={setSelectedYear}>
                                <SelectTrigger id="year-select" className="h-8 min-w-[100px] border-white/10 bg-white/10 text-white shadow-none"><SelectValue placeholder="Año" /></SelectTrigger>
                                <SelectContent>{availableYears.map(year => (<SelectItem key={year} value={year}>{year}</SelectItem>))}</SelectContent>
                            </Select>
                        </div>
                    }
                />

                <ContractTaxAlert compact />

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)]">
                    <div className="p-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div><div className="flex items-center"><FileText className="w-6 h-6 mr-3 text-amber-600" /><h2 className="text-xl font-bold text-slate-900">Retenciones originadas en Contratos</h2></div><p className="text-sm text-slate-500 mt-1">Cruce por contrato, acta, concepto, vencimiento y estado.</p></div>
                        <Button onClick={handleExportContractTaxes} variant="outline"><Download className="w-4 h-4 mr-2"/>Exportar Excel</Button>
                    </div>
                    <div className="p-6">
                        {contractTaxRows.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">No hay retenciones contractuales en {selectedYear}.</div>
                        ) : (
                            <>
                                <div className="md:hidden space-y-3">
                                    {contractTaxRows.map((r, i) => (
                                        <article key={r.contract + '-' + r.act + '-' + i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <h3 className="font-bold text-slate-900">{r.contract}</h3>
                                                    <p className="mt-1 text-xs text-slate-500">{r.act} · {r.date}</p>
                                                    <p className="mt-2 text-sm text-slate-700 break-words">{r.contractor}</p>
                                                </div>
                                                <span className={`shrink-0 text-xs font-bold px-2 py-1 rounded-full ${r.status === 'Pendiente' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{r.status}</span>
                                            </div>
                                            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                                                <div className="rounded-lg bg-white p-2 border"><span className="text-slate-500">Base</span><div className="mt-1 font-mono font-bold">${Number(r.base || 0).toLocaleString('es-CO')}</div></div>
                                                <div className="rounded-lg bg-white p-2 border"><span className="text-slate-500">Renta</span><div className="mt-1 font-mono font-bold">${Number(r.retefuente || 0).toLocaleString('es-CO')}</div></div>
                                                <div className="rounded-lg bg-white p-2 border"><span className="text-slate-500">ReteIVA</span><div className="mt-1 font-mono font-bold">${Number(r.reteiva || 0).toLocaleString('es-CO')}</div></div>
                                                <div className="rounded-lg bg-white p-2 border"><span className="text-slate-500">ReteICA</span><div className="mt-1 font-mono font-bold">${Number(r.reteica || 0).toLocaleString('es-CO')}</div></div>
                                            </div>
                                            {r.dueDate && <div className="mt-3 text-xs text-slate-500"><span className="font-semibold">Vencimiento:</span> {r.dueDate}</div>}
                                        </article>
                                    ))}
                                </div>
                                <div className="hidden md:block overflow-x-auto rounded-lg border max-h-80">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 sticky top-0"><tr><th className="p-3 text-left">Contrato / Acta</th><th className="p-3 text-left">Contratista</th><th className="p-3 text-right">Base</th><th className="p-3 text-right">Renta</th><th className="p-3 text-right">ReteIVA</th><th className="p-3 text-right">ReteICA</th><th className="p-3 text-left">Vencimiento</th><th className="p-3 text-left">Estado</th></tr></thead>
                                        <tbody className="divide-y">{contractTaxRows.map((r,i)=><tr key={r.contract+'-'+r.act+'-'+i}><td className="p-3 font-semibold">{r.contract}<div className="text-xs text-slate-500">{r.act} · {r.date}</div></td><td className="p-3">{r.contractor}</td><td className="p-3 text-right">{r.base.toLocaleString('es-CO')}</td><td className="p-3 text-right">{r.retefuente.toLocaleString('es-CO')}</td><td className="p-3 text-right">{r.reteiva.toLocaleString('es-CO')}</td><td className="p-3 text-right">{r.reteica.toLocaleString('es-CO')}</td><td className="p-3">{r.dueDate||'—'}</td><td className={"p-3 font-semibold "+(r.status==='Pendiente'?'text-amber-700':'text-green-700')}>{r.status}</td></tr>)}</tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)]"><div className="p-6 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div className="flex items-center"><FileText className="w-6 h-6 mr-3 text-blue-600" /><h2 className="text-xl font-bold text-slate-900">Pagos a Terceros (Exógena)</h2></div><Button onClick={handleExportExogena} className="w-full sm:w-auto"><Download className="w-4 h-4 mr-2"/> Exportar Reporte</Button></div><div className="p-6">{!areAllDataLoaded ? <p>Cargando datos...</p> : generateExogenaData.length === 0 ? (<div className="text-center py-10"><Search className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No se encontraron pagos a terceros.</p></div>) : (
                    <>
                        <div className="md:hidden space-y-3">
                            {generateExogenaData.map((row, index) => (
                                <article key={index} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-slate-900 break-words">{row['Nombre o Razón Social']}</h3>
                                            {row['Dirección'] && <p className="mt-2 text-xs text-slate-500 break-words">{row['Dirección']}</p>}
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <div className="text-[10px] uppercase tracking-wide text-slate-400">Pago</div>
                                            <div className="mt-1 font-mono font-bold text-red-600">${parseFloat(row['Pago o Abono en Cuenta'] || 0).toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                        <div className="hidden md:block overflow-x-auto rounded-lg border max-h-72">
                            <table className="w-full"><thead className="bg-slate-50 sticky top-0"><tr><th className="px-6 py-3 text-left text-sm font-semibold text-slate-800">Nombre o Razón Social</th><th className="px-6 py-3 text-left text-sm font-semibold text-slate-800">Dirección</th><th className="px-6 py-3 text-right text-sm font-semibold text-slate-800">Pago o Abono en Cuenta</th></tr></thead><tbody className="divide-y divide-slate-200">{generateExogenaData.map((row, index) => (<tr key={index} className="hover:bg-slate-50"><td className="px-6 py-4 text-sm font-medium text-slate-900">{row['Nombre o Razón Social']}</td><td className="px-6 py-4 text-sm text-slate-600">{row['Dirección']}</td><td className="px-6 py-4 text-sm font-mono text-right text-red-600">${parseFloat(row['Pago o Abono en Cuenta'] || 0).toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td ></tr>))}</tbody></table>
                        </div>
                    </>
                )}</div></motion.div>
                
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)]">
                    <div className="p-6 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center"><BookMarked className="w-6 h-6 mr-3 text-emerald-600" /><h2 className="text-xl font-bold text-slate-900">Declaración de Renta</h2></div>
                        <Button onClick={handleExportRenta} variant="outline" className="w-full sm:w-auto text-emerald-700 border-emerald-300 hover:bg-emerald-50"><Download className="w-4 h-4 mr-2"/> Exportar Reporte</Button>
                    </div>
                    <div className="p-6">
                        <div className="md:hidden space-y-2">
                            {!areAllDataLoaded ? <p className="p-4">Cargando...</p> : generateRentaData.map((row, index) => {
                                if (row.isSpacer) return <div key={index} className="h-2" />;
                                const rawValue = row.Valor == null ? null : parseFloat(row.Valor);
                                const isDepr = (row.Concepto || '').toLowerCase().includes('depreciación') || (rawValue != null && rawValue < 0);
                                const absVal = rawValue == null ? null : Math.abs(rawValue);
                                const formatted = absVal == null ? '' : absVal.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                const valueText = rawValue == null ? '' : rawValue === 0 ? '$ 0,00' : isDepr ? `$ (${formatted})` : `$ ${formatted}`;
                                return (
                                    <article key={index} className={`rounded-lg border px-3 py-3 ${row.isTotal ? 'bg-slate-100 border-slate-300' : row.isSubtotal ? 'bg-slate-50' : 'bg-white'}`}>
                                        <div className="text-sm text-slate-700">
                                            <span className={row.isTotal ? 'font-black' : row.isSubtotal ? 'font-bold' : 'font-medium'}>{row.Concepto?.trim()}</span>
                                        </div>
                                        {valueText && <div className={`mt-1 text-right font-mono text-sm ${row.isTotal ? 'font-bold text-slate-900' : 'text-slate-700'}`}>{valueText}</div>}
                                    </article>
                                );
                            })}
                        </div>
                        <div className="hidden md:block overflow-x-auto rounded-lg border">
                            {!areAllDataLoaded ? <p className="p-4">Cargando...</p> : 
                            <table className="w-full">
                                <thead className="bg-slate-50"><tr><th className="px-6 py-3 text-left text-sm font-semibold text-slate-800">Concepto</th><th className="px-6 py-3 text-right text-sm font-semibold text-slate-800">Valor</th></tr></thead>
                                <tbody>
                                    {generateRentaData.map((row, index) => {
                                        if (row.isSpacer) return <tr key={index}><td colSpan="2" className="py-3 bg-white"></td></tr>;
                                        return (
                                            <tr key={index} className={`${row.isTotal ? 'bg-slate-100 border-t-2 border-slate-300' : ''} ${row.isSubtotal ? 'bg-slate-50 border-t border-slate-200' : 'border-b border-slate-100'}`}>
                                                <td className={`px-6 py-3 text-sm ${row.isTotal ? 'font-black text-slate-800' : (row.isSubtotal ? 'font-bold text-slate-700' : 'font-medium text-slate-600')} ${row.Concepto?.startsWith('    ') ? 'pl-16' : row.Concepto?.startsWith('  ') ? 'pl-10' : ''}`}>
                                                    {row.Concepto?.trim()}
                                                </td>
                                                <td className={`px-6 py-3 text-sm font-mono text-right ${row.isTotal ? 'font-bold' : ''}`}>
    {(() => {
        if (row.Valor == null) return '';
        const val = parseFloat(row.Valor);
        const isDepr = (row.Concepto || '').toLowerCase().includes('depreciación') || val < 0;
        const absVal = Math.abs(val);
        const formatted = absVal.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (val === 0) return '$ 0,00';
        return isDepr ? `$ (${formatted})` : `$ ${formatted}`;
    })()}
</td>                                               
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>}
                        </div>
                    </div>
                </motion.div>
            </div>
        </>
    );
};

export default TaxReports;