import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, FileSignature, ClipboardList, Printer, BadgeDollarSign, AlertTriangle, Building2, CalendarDays, ArrowRightLeft, X, Save, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext';
import { usePermission } from '@/hooks/usePermission';
import jsPDF from 'jspdf';
import { CONTRACT_TYPES, UVT_2026, getContractType, calculateContractTaxes, getRetentionAlert } from '@/lib/contractTaxEngine';

const money = value => (Number(value) || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const todayIso = () => new Date().toISOString().slice(0, 10);
const idNow = prefix => prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);

const defaultContract = {
  number: '', type: 'construction', object: '', contractorId: '', startDate: todayIso(), endDate: '', value: '', advancePct: '0',
  executionAccountCode: '1508', executionAccountName: 'CONSTRUCCIONES EN CURSO',
  completionAccountCode: '1516', completionAccountName: 'CONSTRUCCIONES Y EDIFICACIONES',
  contractorIsDeclarant: true, contractorIsNatural: false, vatResponsible: false, vatRate: '19',
  vatWithholdingAgent: false, reteIcaRate: '0', notes: ''
};
const defaultAct = { date: todayIso(), number: '', title: 'Acta parcial de obra / servicio', grossValue: '', vatBase: '', amortization: '', description: '' };

const pageText = (doc, text, x, y, width = 175, size = 10) => {
  doc.setFontSize(size); const lines = doc.splitTextToSize(String(text || ''), width); doc.text(lines, x, y);
  return y + (lines.length * (size * 0.42)) + 2;
};
const addPdfHeader = (doc, company, title) => {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(company?.name || 'ENTIDAD', 105, 16, { align: 'center' });
  doc.setFontSize(10); doc.text('NIT: ' + (company?.doc || '—'), 105, 22, { align: 'center' });
  doc.setFontSize(14); doc.text(title, 105, 32, { align: 'center' }); doc.setFont('helvetica', 'normal');
};

const ContractModal = ({ open, onClose, onSave, contacts, accounts }) => {
  const [form, setForm] = useState(defaultContract);
  if (!open) return null;
  const typeInfo = getContractType(form.type);
  const updateType = value => {
    const info = getContractType(value);
    const exec = accounts.find(a => String(a.number).startsWith(info.accountPrefix));
    const completion = accounts.find(a => String(a.number).startsWith('1516'));
    setForm(prev => ({ ...prev, type: value,
      executionAccountCode: exec?.number || info.accountPrefix,
      executionAccountName: exec?.name || info.accountName || prev.executionAccountName,
      completionAccountCode: completion?.number || '1516',
      completionAccountName: completion?.name || prev.completionAccountName }));
  };
  const submit = e => {
    e.preventDefault(); const contractor = contacts.find(c => String(c.id) === String(form.contractorId)); if (!contractor) return;
    onSave({ ...form, contractorName: contractor.name, contractorDoc: contractor.docNumber || contractor.doc || '' }); setForm(defaultContract);
  };
  return <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4">
    <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
      <div className="p-5 border-b flex justify-between items-center sticky top-0 bg-white z-10">
        <div><h2 className="text-xl font-bold">Nuevo Contrato</h2><p className="text-sm text-slate-500">Expediente contractual y configuración contable-tributaria.</p></div>
        <button type="button" onClick={onClose}><X className="w-5 h-5" /></button>
      </div>
      <div className="p-6 grid md:grid-cols-2 gap-4">
        <div><Label>Número *</Label><input required value={form.number} onChange={e=>setForm({...form,number:e.target.value})} className="w-full p-2 border rounded-lg" placeholder="CT-2026-001"/></div>
        <div><Label>Tipo *</Label><select value={form.type} onChange={e=>updateType(e.target.value)} className="w-full p-2 border rounded-lg">{CONTRACT_TYPES.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
        <div className="md:col-span-2"><Label>Objeto *</Label><textarea required value={form.object} onChange={e=>setForm({...form,object:e.target.value})} className="w-full p-2 border rounded-lg" rows="2"/></div>
        <div><Label>Contratista *</Label><select required value={form.contractorId} onChange={e=>setForm({...form,contractorId:e.target.value})} className="w-full p-2 border rounded-lg"><option value="">Seleccione...</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><Label>Valor contractual *</Label><input required type="number" min="0" value={form.value} onChange={e=>setForm({...form,value:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
        <div><Label>Fecha inicio *</Label><input type="date" required value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
        <div><Label>Fecha terminación</Label><input type="date" value={form.endDate} onChange={e=>setForm({...form,endDate:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
        <div><Label>Anticipo (%)</Label><input type="number" min="0" max="100" value={form.advancePct} onChange={e=>setForm({...form,advancePct:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
        <div className="flex items-end gap-5 pb-2">
          <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={form.contractorIsDeclarant} onChange={e=>setForm({...form,contractorIsDeclarant:e.target.checked})}/> Declarante renta</label>
          <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={form.contractorIsNatural} onChange={e=>setForm({...form,contractorIsNatural:e.target.checked})}/> Persona natural</label>
        </div>
        <div><Label>Cuenta de ejecución</Label><select value={form.executionAccountCode} onChange={e=>{const a=accounts.find(x=>x.number===e.target.value);setForm({...form,executionAccountCode:e.target.value,executionAccountName:a?.name||''})}} className="w-full p-2 border rounded-lg">{accounts.filter(a=>['1','5','6','7'].includes(String(a.number||'')[0])).map(a=><option key={a.id} value={a.number}>{a.number} - {a.name}</option>)}</select></div>
        <div><Label>Cuenta al terminar</Label><select disabled={!typeInfo.capitalizable} value={form.completionAccountCode} onChange={e=>{const a=accounts.find(x=>x.number===e.target.value);setForm({...form,completionAccountCode:e.target.value,completionAccountName:a?.name||''})}} className="w-full p-2 border rounded-lg disabled:bg-slate-100">{accounts.filter(a=>String(a.number||'').startsWith('15')).map(a=><option key={a.id} value={a.number}>{a.number} - {a.name}</option>)}</select></div>
        <div className="flex gap-5 items-center">
          <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={form.vatResponsible} onChange={e=>setForm({...form,vatResponsible:e.target.checked})}/> Responsable de IVA</label>
          <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={form.vatWithholdingAgent} onChange={e=>setForm({...form,vatWithholdingAgent:e.target.checked})}/> Practicar reteIVA</label>
        </div>
        <div><Label>Tarifa ICA ‰ (si aplica)</Label><input type="number" step="0.001" min="0" value={form.reteIcaRate} onChange={e=>setForm({...form,reteIcaRate:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
        <div className="md:col-span-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">Motor 2026: UVT {money(UVT_2026)}. La clasificación fiscal depende de la realidad del servicio y del RUT del contratista; los campos tributarios quedan visibles y auditables.</div>
      </div>
      <div className="p-5 border-t flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit"><Save className="w-4 h-4 mr-2"/>Crear contrato</Button></div>
    </form>
  </div>;
};
const ActModal = ({ open, onClose, contract, onSave }) => {
  const [form, setForm] = useState(defaultAct);
  if (!open || !contract) return null;
  const remainingAdvance = Math.max(0, Number(contract.advanceValue||0)-Number(contract.amortizedAdvance||0));
  const suggestedAmortization = Math.min(remainingAdvance, (Number(form.grossValue)||0) * ((Number(contract.advancePct)||0)/100));
  const type = getContractType(contract.type);
  const taxes = calculateContractTaxes({
    typeKey: contract.type,
    baseAmount: form.grossValue,
    contractor: { type: contract.contractorIsNatural ? 'person' : 'company', declarant: contract.contractorIsDeclarant },
    tax: {
      appliesVAT: contract.vatResponsible,
      vatRate: Number(contract.vatRate || 19),
      constructionProfitBase: form.vatBase === '' ? 0 : form.vatBase,
      manualVatBase: form.vatBase === '' ? form.grossValue : form.vatBase,
      appliesReteIVA: contract.vatWithholdingAgent,
      reteIvaRate: 15,
      appliesReteICA: Number(contract.reteIcaRate || 0) > 0,
      reteIcaPerThousand: contract.reteIcaRate
    }
  });
  const amortization = form.amortization === '' ? suggestedAmortization : Number(form.amortization)||0;
  const netPayable = Math.max(0, taxes.netBeforeAdvance - amortization);
  const submit = e => { e.preventDefault(); onSave({ ...form, amortization, taxes, netPayable, grossValue:Number(form.grossValue)||0 }); setForm(defaultAct); };

  return <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4">
    <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
      <div className="p-5 border-b flex justify-between"><div><h2 className="text-xl font-bold">Registrar Acta</h2><p className="text-sm text-slate-500">Contrato {contract.number}</p></div><button type="button" onClick={onClose}><X className="w-5 h-5"/></button></div>
      <div className="p-6 grid md:grid-cols-2 gap-4">
        <div><Label>Número de acta *</Label><input required value={form.number} onChange={e=>setForm({...form,number:e.target.value})} className="w-full p-2 border rounded-lg" placeholder="ACT-001"/></div>
        <div><Label>Fecha *</Label><input required type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
        <div className="md:col-span-2"><Label>Título</Label><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
        <div><Label>Valor ejecutado / base *</Label><input required type="number" min="0" value={form.grossValue} onChange={e=>setForm({...form,grossValue:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
        <div><Label>{type.vatMode === 'construction-profit' ? 'Base IVA · honorarios/utilidad' : 'Base IVA (vacío = valor ejecutado)'}</Label><input type="number" min="0" value={form.vatBase} onChange={e=>setForm({...form,vatBase:e.target.value})} className="w-full p-2 border rounded-lg"/>{type.vatMode === 'construction-profit' && contract.vatResponsible && <p className="text-xs text-amber-700 mt-1">En obra sobre inmueble, indica los honorarios o utilidad que constituyen la base del IVA.</p>}</div>
        <div><Label>Amortización anticipo</Label><input type="number" min="0" max={remainingAdvance} value={form.amortization} onChange={e=>setForm({...form,amortization:e.target.value})} placeholder={String(Math.round(suggestedAmortization))} className="w-full p-2 border rounded-lg"/></div>
        <div className="md:col-span-2"><Label>Descripción / alcance</Label><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="w-full p-2 border rounded-lg" rows="2"/></div>
        <div className="md:col-span-2 bg-slate-50 border rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><span className="text-slate-500">IVA</span><p className="font-bold">{money(taxes.vat)}</p></div>
          <div><span className="text-slate-500">Retefuente</span><p className="font-bold text-red-600">-{money(taxes.incomeWithholding)}</p></div>
          <div><span className="text-slate-500">ReteIVA + ICA</span><p className="font-bold text-red-600">-{money(taxes.reteIva+taxes.reteIca)}</p></div>
          <div><span className="text-slate-500">Neto CxP</span><p className="font-black text-blue-700">{money(netPayable)}</p></div>
        </div>
        <div className="md:col-span-2 text-xs text-slate-500">{taxes.rule.label}: {taxes.retentionRate.toFixed(2)}% · Base mínima {taxes.threshold ? money(taxes.threshold) : 'sin mínimo configurado'} · Regla {taxes.rule.taxConcept} · versión CO-2026-05-08.</div>
      </div>
      <div className="p-5 border-t flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit">Registrar y contabilizar</Button></div>
    </form>
  </div>;
};

const Contracts = () => {
  const { activeCompany } = useCompany(); const { canAdd, canEdit } = usePermission(); const { toast } = useToast();
  const [contracts, saveContracts] = useCompanyData('contracts');
  const [transactions, saveTransactions] = useCompanyData('transactions'); const [accountsPayable, saveAccountsPayable] = useCompanyData('accountsPayable');
  const [contacts] = useCompanyData('contacts'); const [accounts] = useCompanyData('accounts');
  const [bankAccounts] = useCompanyData('bankAccounts'); const [cashAccounts] = useCompanyData('cash_accounts');
  const [contractOpen, setContractOpen] = useState(false); const [actOpen, setActOpen] = useState(false); const [selectedId, setSelectedId] = useState(null);
  const [advanceSource, setAdvanceSource] = useState('caja_principal|CAJA PRINCIPAL');
  const selected = (contracts||[]).find(c=>c.id===selectedId) || null;
  const selectedActs = [...(selected?.acts || [])].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const totals = useMemo(() => ({ executed:selectedActs.reduce((s,a)=>s+Number(a.grossValue||0),0), amortized:selectedActs.reduce((s,a)=>s+Number(a.amortization||0),0), withheld:selectedActs.reduce((s,a)=>s+Number(a.tax?.totalWithholdings||0),0) }), [selectedActs]);

  const createContract = data => {
    const advanceValue=(Number(data.value)||0)*(Number(data.advancePct)||0)/100;
    const row={...data,id:idNow('contract'),advanceValue,amortizedAdvance:0,advancePosted:false,acts:[],status:'Vigente',createdAt:new Date().toISOString()};
    saveContracts([...(contracts||[]),row]); setSelectedId(row.id); setContractOpen(false);
    toast({title:'Contrato creado',description:'Expediente contractual listo para actas y contabilización.'});
  };
  const nextTransferVoucher = date => {
    const year = String(date || '').slice(0,4);
    return (transactions || []).filter(t => String(t.date || '').slice(0,4) === year && (t.voucherPrefix === 'T' || t.type === 'transfer' || t.isInternalTransfer)).reduce((max,t)=>Math.max(max,Number(t.voucherNumber)||0),0)+1;
  };
  const createAccountingTransaction = (payload, voucherNumber) => ({
    id:idNow('txn-contract'), date:payload.date, type:'transfer', description:payload.description, amount:payload.amount,
    category:payload.debit.name, voucherPrefix:'T', voucherNumber, debitAccount:payload.debit, creditAccount:payload.credit,
    isInternalTransfer:true, isContractEntry:true, contractManaged:true, contractId:selected.id, contractActId:payload.actId,
    company_id:activeCompany?.id, companyId:activeCompany?.id, contactId:selected.contractorId
  });

  const saveAct = data => {
    if(!selected)return;
    const act={...data,tax:data.taxes,id:idNow('act'),contractId:selected.id,contractNumber:selected.number,contractorName:selected.contractorName,createdAt:new Date().toISOString()};
    const voucherNumber=nextTransferVoucher(data.date); const accounting=[]; const invoiceTotal=Number(data.taxes.invoiceTotal||0);
    accounting.push(createAccountingTransaction({date:data.date,amount:invoiceTotal,actId:act.id,description:'Acta '+data.number+' · Contrato '+selected.number+' · '+selected.object,debit:{code:selected.executionAccountCode,name:selected.executionAccountName},credit:{code:'23050101',name:'CUENTAS POR PAGAR'}},voucherNumber));
    [['incomeWithholding','2365','RETENCIÓN EN LA FUENTE'],['reteIva','2367','RETENCIÓN DE IVA'],['reteIca','2368','RETENCIÓN ICA']].forEach(item=>{
      const amount=Number(data.taxes[item[0]]||0); if(amount<=0)return;
      accounting.push(createAccountingTransaction({date:data.date,amount,actId:act.id,description:item[2]+' · Acta '+data.number+' · Contrato '+selected.number,debit:{code:'23050101',name:'CUENTAS POR PAGAR'},credit:{code:item[1],name:item[2]}},voucherNumber));
    });
    if(Number(data.amortization)>0) accounting.push(createAccountingTransaction({date:data.date,amount:Number(data.amortization),actId:act.id,description:'Amortización de anticipo · Acta '+data.number+' · Contrato '+selected.number,debit:{code:'23050101',name:'CUENTAS POR PAGAR'},credit:{code:'133005',name:'ANTICIPOS Y AVANCES'}},voucherNumber));
    const payable={id:idNow('payable-contract'),supplier:selected.contractorName,description:'Contrato '+selected.number+' · Acta '+data.number,issueDate:data.date,dueDate:data.date,amount:data.netPayable,linkedAccount:'23050101',status:'Pendiente',contractManaged:true,contractId:selected.id,contractActId:act.id,contactId:selected.contractorId,company_id:activeCompany?.id,companyId:activeCompany?.id};
    saveTransactions([...(transactions||[]),...accounting]); saveAccountsPayable([...(accountsPayable||[]),payable]);
    saveContracts((contracts||[]).map(c=>c.id===selected.id?{...c,acts:[...(c.acts||[]),act],amortizedAdvance:Number(c.amortizedAdvance||0)+Number(data.amortization||0)}:c));
    setActOpen(false); toast({title:'Acta contabilizada',description:'Comprobante T-'+String(voucherNumber).padStart(4,'0')+', CxP y retenciones vinculadas al expediente.'});
  };

  const postAdvance = () => {
    if(!selected || Number(selected.advanceValue||0)<=0 || selected.advancePosted)return;
    const [sourceId, sourceName] = String(advanceSource||'').split('|');
    const bank=(bankAccounts||[]).find(b=>String(b.id)===sourceId); const cash=(cashAccounts||[]).find(c=>String(c.id)===sourceId);
    const credit=sourceId==='caja_principal'?{code:'11050501',name:'CAJA PRINCIPAL'}:bank?{code:bank.accountingCode||'1110',name:bank.accountingConcept||bank.bankName}:cash?{code:cash.accounting_account||'1105',name:cash.name}:{code:'1110',name:sourceName||'CUENTA DE PAGO'};
    const date=selected.startDate||todayIso(); const voucherNumber=nextTransferVoucher(date);
    const txn=createAccountingTransaction({date,amount:Number(selected.advanceValue),actId:null,description:'Anticipo contrato '+selected.number+' · '+selected.contractorName,debit:{code:'133005',name:'ANTICIPOS Y AVANCES'},credit},voucherNumber);
    saveTransactions([...(transactions||[]),txn]); saveContracts((contracts||[]).map(c=>c.id===selected.id?{...c,advancePosted:true,advanceTransactionId:txn.id,advancePostedAt:new Date().toISOString()}:c));
    toast({title:'Anticipo contabilizado',description:'Comprobante T-'+String(voucherNumber).padStart(4,'0')+' generado contra '+credit.name+'.'});
  };

  const capitalize = () => {
    if(!selected||!getContractType(selected.type).capitalizable||totals.executed<=0||selected.status==='Liquidado')return;
    const date=todayIso(); const voucherNumber=nextTransferVoucher(date);
    const txn=createAccountingTransaction({date,amount:totals.executed,actId:null,description:'Capitalización / cierre Contrato '+selected.number+': '+selected.object,debit:{code:selected.completionAccountCode,name:selected.completionAccountName},credit:{code:selected.executionAccountCode,name:selected.executionAccountName}},voucherNumber);
    saveTransactions([...(transactions||[]),txn]); saveContracts((contracts||[]).map(c=>c.id===selected.id?{...c,status:'Liquidado',capitalizedAt:new Date().toISOString(),capitalizationTransactionId:txn.id}:c));
    toast({title:'Contrato capitalizado',description:'Se generó el comprobante T-'+String(voucherNumber).padStart(4,'0')+' y el cruce hacia el activo definitivo.'});
  };

  const markTaxPaid = actId => {
    if(!selected)return;
    saveContracts((contracts||[]).map(c=>c.id===selected.id?{...c,acts:(c.acts||[]).map(a=>a.id===actId?{...a,taxStatus:'paid',taxPaidAt:new Date().toISOString()}:a)}:c));
    toast({title:'Retención actualizada',description:'La obligación del acta quedó marcada como declarada/pagada y sale de las alertas pendientes.'});
  };

  const printContract = contract => {
    const doc=new jsPDF(); addPdfHeader(doc,activeCompany,'CONTRATO '+contract.number); let y=43;
    y=pageText(doc,'CONTRATISTA: '+contract.contractorName+' · '+(contract.contractorDoc||''),18,y); y=pageText(doc,'TIPO: '+getContractType(contract.type).label,18,y);
    y=pageText(doc,'OBJETO: '+contract.object,18,y); y=pageText(doc,'VALOR: '+money(contract.value),18,y); y=pageText(doc,'PLAZO: '+contract.startDate+' a '+(contract.endDate||'por definir'),18,y);
    y=pageText(doc,'ANTICIPO: '+(contract.advancePct||0)+'% ('+money(contract.advanceValue)+')',18,y); y+=5; y=pageText(doc,'CLÁUSULAS GENERALES',18,y,175,11);
    y=pageText(doc,'El contratista se obliga a ejecutar el objeto descrito conforme a las condiciones pactadas, soportes, actas y obligaciones legales y tributarias aplicables. Todo pago estará sujeto a los descuentos, amortizaciones y retenciones que correspondan.',18,y);
    y+=25; doc.text('CONTRATANTE',35,y); doc.text('CONTRATISTA',135,y); doc.line(18,y+12,82,y+12); doc.line(115,y+12,190,y+12); doc.save('Contrato_'+contract.number+'.pdf');
  };
  const printAct = act => {
    const contract=(contracts||[]).find(c=>c.id===act.contractId); if(!contract)return; const doc=new jsPDF(); addPdfHeader(doc,activeCompany,(act.title||'ACTA')+' · '+act.number); let y=43;
    y=pageText(doc,'CONTRATO: '+contract.number+' · '+contract.object,18,y); y=pageText(doc,'CONTRATISTA: '+contract.contractorName,18,y); y=pageText(doc,'FECHA: '+act.date,18,y); y=pageText(doc,'ALCANCE: '+(act.description||'Según avance certificado.'),18,y);
    y=pageText(doc,'VALOR EJECUTADO: '+money(act.grossValue),18,y); y=pageText(doc,'IVA: '+money(act.tax?.vat)+' · RETEFUENTE: '+money(act.tax?.incomeWithholding)+' · RETEIVA: '+money(act.tax?.reteIva)+' · RETEICA: '+money(act.tax?.reteIca),18,y);
    y=pageText(doc,'AMORTIZACIÓN ANTICIPO: '+money(act.amortization)+' · NETO A PAGAR: '+money(act.netPayable),18,y); y+=25;
    doc.text('SUPERVISOR / CONTRATANTE',25,y); doc.text('CONTRATISTA',135,y); doc.line(18,y+12,92,y+12); doc.line(115,y+12,190,y+12); doc.save('Acta_'+act.number+'_Contrato_'+contract.number+'.pdf');
  };

  const alerts=(contracts||[]).flatMap(contract=>(contract.acts||[]).filter(act=>Number(act.tax?.totalWithholdings||0)>0 && act.taxStatus!=='paid').map(act=>({id:act.id,description:'Contrato '+contract.number+' · Acta '+act.number,amount:Number(act.tax?.totalWithholdings||0),...getRetentionAlert(act.date,activeCompany?.doc)}))).filter(a=>a.dueDate).sort((a,b)=>(a.days??999)-(b.days??999));

  return <>
    <Helmet><title>Contratos - JaiderHerTur26</title></Helmet>
    <div className="space-y-6">
      <motion.div initial={{opacity:0,y:-15}} animate={{opacity:1,y:0}} className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div><h1 className="text-4xl font-bold text-slate-900">Contratos</h1><p className="text-slate-600">Contratación, actas, anticipos, retenciones y contabilización integrada.</p></div>
        {canAdd&&<Button onClick={()=>setContractOpen(true)}><Plus className="w-4 h-4 mr-2"/>Nuevo Contrato</Button>}
      </motion.div>

      {alerts.length>0&&<div className="bg-amber-50 border border-amber-200 rounded-xl p-4"><div className="flex items-center gap-2 font-bold text-amber-900 mb-2"><AlertTriangle className="w-5 h-5"/>Obligaciones tributarias pendientes</div><div className="grid md:grid-cols-2 gap-2">{alerts.slice(0,4).map(a=><div key={a.id} className="bg-white border rounded-lg p-3 text-sm"><div className="font-semibold">{a.description}</div><div className={a.days<0?'text-red-600 font-bold':'text-amber-700'}>{a.dueDate?(a.days<0?'Vencida hace '+Math.abs(a.days)+' día(s)':'Vence en '+a.days+' día(s) · '+a.dueDate):'Fecha pendiente de validación DIAN'}</div><div>{money(a.amount)}</div></div>)}</div></div>}
      <div className="grid lg:grid-cols-[360px_1fr] gap-5">
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden"><div className="p-4 border-b font-bold">Expedientes ({(contracts||[]).length})</div><div className="max-h-[70vh] overflow-y-auto divide-y">{(contracts||[]).length===0?<div className="p-8 text-center text-slate-500">Aún no hay contratos.</div>:(contracts||[]).map(c=><button key={c.id} onClick={()=>setSelectedId(c.id)} className={'w-full text-left p-4 hover:bg-slate-50 '+(selectedId===c.id?'bg-blue-50 border-l-4 border-blue-600':'')}><div className="flex justify-between gap-2"><span className="font-bold">{c.number}</span><span className={'text-xs px-2 py-0.5 rounded-full '+(c.status==='Liquidado'?'bg-green-100 text-green-700':'bg-blue-100 text-blue-700')}>{c.status}</span></div><div className="text-sm mt-1 line-clamp-2">{c.object}</div><div className="text-xs text-slate-500 mt-1">{c.contractorName} · {money(c.value)}</div></button>)}</div></div>
        <div className="space-y-5">{!selected?<div className="bg-white rounded-xl border p-12 text-center text-slate-500"><FileSignature className="w-14 h-14 mx-auto text-slate-300 mb-3"/><p>Selecciona o crea un contrato para abrir su expediente.</p></div>:<>
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <div className="flex flex-col md:flex-row justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-2xl font-black">{selected.number}</h2><span className="text-xs px-2 py-1 bg-slate-100 rounded">{getContractType(selected.type).label}</span></div><p className="text-slate-600 mt-1">{selected.object}</p><p className="text-sm text-slate-500 mt-1">{selected.contractorName}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>printContract(selected)}><Printer className="w-4 h-4 mr-2"/>Contrato PDF</Button>{canAdd&&selected.status!=='Liquidado'&&<Button onClick={()=>setActOpen(true)}><ClipboardList className="w-4 h-4 mr-2"/>Nueva Acta</Button>}{canEdit&&getContractType(selected.type).capitalizable&&selected.status!=='Liquidado'&&totals.executed>0&&<Button variant="outline" onClick={capitalize}><ArrowRightLeft className="w-4 h-4 mr-2"/>Capitalizar</Button>}</div></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5"><div className="bg-slate-50 rounded-lg p-3"><span className="text-xs text-slate-500">Valor contrato</span><p className="font-black">{money(selected.value)}</p></div><div className="bg-slate-50 rounded-lg p-3"><span className="text-xs text-slate-500">Ejecutado</span><p className="font-black">{money(totals.executed)}</p></div><div className="bg-slate-50 rounded-lg p-3"><span className="text-xs text-slate-500">Anticipo / amortizado</span><p className="font-black">{money(selected.advanceValue)} / {money(totals.amortized)}</p></div><div className="bg-slate-50 rounded-lg p-3"><span className="text-xs text-slate-500">Retenciones acumuladas</span><p className="font-black text-red-600">{money(totals.withheld)}</p></div></div>
            {Number(selected.advanceValue||0)>0&&!selected.advancePosted&&selected.status!=='Liquidado'&&<div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-3 flex flex-col md:flex-row gap-3 md:items-end"><div className="flex-1"><Label>Cuenta desde la que se paga el anticipo</Label><select value={advanceSource} onChange={e=>setAdvanceSource(e.target.value)} className="w-full p-2 border rounded-lg bg-white"><option value="caja_principal|CAJA PRINCIPAL">CAJA PRINCIPAL</option>{(cashAccounts||[]).map(c=><option key={c.id} value={c.id+'|'+c.name}>{c.name}</option>)}{(bankAccounts||[]).map(b=><option key={b.id} value={b.id+'|'+(b.bankName||b.name)}>{b.bankName||b.name}</option>)}</select></div><Button onClick={postAdvance}><BadgeDollarSign className="w-4 h-4 mr-2"/>Contabilizar anticipo {money(selected.advanceValue)}</Button></div>}
          </div>
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden"><div className="p-4 border-b flex items-center justify-between"><div className="font-bold flex items-center gap-2"><ClipboardList className="w-5 h-5"/>Actas y ejecución</div><span className="text-xs text-slate-500">{selectedActs.length} acta(s)</span></div>{selectedActs.length===0?<div className="p-10 text-center text-slate-500">No hay actas registradas.</div>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-3 text-left">Acta</th><th className="p-3 text-left">Fecha</th><th className="p-3 text-right">Ejecutado</th><th className="p-3 text-right">Retenciones</th><th className="p-3 text-right">Neto CxP</th><th className="p-3"></th></tr></thead><tbody className="divide-y">{selectedActs.map(a=><tr key={a.id}><td className="p-3 font-semibold">{a.number}</td><td className="p-3">{a.date}</td><td className="p-3 text-right">{money(a.grossValue)}</td><td className="p-3 text-right text-red-600">{money(a.tax?.totalWithholdings)}</td><td className="p-3 text-right font-bold">{money(a.netPayable)}</td><td className="p-3 text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={()=>printAct(a)} title="Imprimir acta"><Printer className="w-4 h-4"/></Button>{Number(a.tax?.totalWithholdings||0)>0&&a.taxStatus!=='paid'&&<Button size="sm" variant="outline" onClick={()=>markTaxPaid(a.id)} title="Marcar retención declarada/pagada"><CheckCircle2 className="w-4 h-4 text-green-600"/></Button>}</div></td></tr>)}</tbody></table></div>}</div>
          <div className="grid md:grid-cols-3 gap-3"><div className="bg-white border rounded-xl p-4"><Building2 className="w-5 h-5 text-blue-600 mb-2"/><div className="text-xs text-slate-500">Ejecución contable</div><div className="font-bold">{selected.executionAccountCode}</div><div className="text-sm">{selected.executionAccountName}</div></div><div className="bg-white border rounded-xl p-4"><BadgeDollarSign className="w-5 h-5 text-emerald-600 mb-2"/><div className="text-xs text-slate-500">Retención renta</div><div className="font-bold">{getContractType(selected.type).taxConcept}</div><div className="text-sm">Cálculo por cada acta/pago.</div></div><div className="bg-white border rounded-xl p-4"><CalendarDays className="w-5 h-5 text-amber-600 mb-2"/><div className="text-xs text-slate-500">Plazo contractual</div><div className="font-bold">{selected.startDate}</div><div className="text-sm">hasta {selected.endDate||'por definir'}</div></div></div>
        </>}</div>
      </div>
    </div>
    <ContractModal open={contractOpen} onClose={()=>setContractOpen(false)} onSave={createContract} contacts={contacts||[]} accounts={accounts||[]}/>
    <ActModal open={actOpen} onClose={()=>setActOpen(false)} contract={selected} onSave={saveAct}/>
  </>;
};
export default Contracts;
