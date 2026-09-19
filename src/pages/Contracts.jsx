import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, FileSignature, ClipboardList, Printer, BadgeDollarSign, AlertTriangle, Building2, CalendarDays, ArrowRightLeft, X, Save, CheckCircle2, ShieldCheck, FilePlus2, History, Flag } from 'lucide-react';
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

const ACT_TYPES = [
  { key:'start', label:'Acta de Inicio', financial:false },
  { key:'partial', label:'Acta Parcial de Obra / Servicio', financial:true },
  { key:'suspension', label:'Acta de Suspensión', financial:false },
  { key:'restart', label:'Acta de Reinicio', financial:false },
  { key:'final_delivery', label:'Acta de Recibo / Entrega Final', financial:true },
  { key:'liquidation', label:'Acta de Liquidación', financial:false },
];
const defaultContract = {
  number: '', type: 'construction', object: '', contractorId: '', startDate: todayIso(), endDate: '', value: '', advancePct: '0',
  supervisor: '', paymentTerms: 'Pago contra actas aprobadas y soportes válidos.', executionPlace: '',
  executionAccountCode: '1508', executionAccountName: 'CONSTRUCCIONES EN CURSO',
  completionAccountCode: '1516', completionAccountName: 'CONSTRUCCIONES Y EDIFICACIONES',
  contractorIsDeclarant: true, contractorIsNatural: false, contractorHonorarios11: false, vatResponsible: false, vatRate: '19', vatTreatment: 'cost',
  vatWithholdingAgent: false, reteIcaRate: '0', notes: ''
};
const defaultAct = { type:'partial', date: todayIso(), number: '', title: 'Acta parcial de obra / servicio', grossValue: '', vatBase: '', amortization: '', description: '' };
const defaultAddendum = { number:'', date:todayIso(), kind:'addition', amountChange:'0', newEndDate:'', description:'' };
const defaultGuarantee = { type:'Cumplimiento', policyNumber:'', insurer:'', validFrom:todayIso(), validTo:'', amount:'', notes:'' };

const effectiveContractValue = contract => Number(contract?.value||0) + (contract?.amendments||[]).reduce((s,a)=>s+Number(a.amountChange||0),0);
const effectiveEndDate = contract => [...(contract?.amendments||[])].reverse().find(a=>a.newEndDate)?.newEndDate || contract?.endDate || '';
const actTypeLabel = type => ACT_TYPES.find(x=>x.key===type)?.label || 'Acta contractual';
const daysToDate = dateText => { if(!dateText) return null; const [y,m,d]=String(dateText).split('-').map(Number); const target=new Date(y,m-1,d); const now=new Date(); const base=new Date(now.getFullYear(),now.getMonth(),now.getDate()); return Math.ceil((target-base)/86400000); };

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
    onSave({ ...form, contractorName: contractor.name, contractorDoc: contractor.docNumber || contractor.doc || '', contractorAddress: contractor.address || '', contractorPhone: contractor.phone || '', contractorEmail: contractor.email || '' }); setForm(defaultContract);
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
        <div><Label>Supervisor / responsable</Label><input value={form.supervisor} onChange={e=>setForm({...form,supervisor:e.target.value})} className="w-full p-2 border rounded-lg" placeholder="Nombre del supervisor o responsable"/></div>
        <div><Label>Lugar de ejecución</Label><input value={form.executionPlace} onChange={e=>setForm({...form,executionPlace:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
        <div><Label>Forma de pago</Label><input value={form.paymentTerms} onChange={e=>setForm({...form,paymentTerms:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
        <div className="md:col-span-2 flex flex-wrap items-center gap-5 pb-2">
          <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={form.contractorIsDeclarant} onChange={e=>setForm({...form,contractorIsDeclarant:e.target.checked})}/> Declarante renta</label>
          <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={form.contractorIsNatural} onChange={e=>setForm({...form,contractorIsNatural:e.target.checked})}/> Persona natural</label>
          {(form.type==='professional'||form.type==='consulting')&&<label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={form.contractorHonorarios11} onChange={e=>setForm({...form,contractorHonorarios11:e.target.checked})}/> Honorarios al 11% por condición aplicable</label>}
        </div>
        <div><Label>Cuenta de ejecución</Label><select value={form.executionAccountCode} onChange={e=>{const a=accounts.find(x=>x.number===e.target.value);setForm({...form,executionAccountCode:e.target.value,executionAccountName:a?.name||''})}} className="w-full p-2 border rounded-lg">{accounts.filter(a=>['1','5','6','7'].includes(String(a.number||'')[0])).map(a=><option key={a.id} value={a.number}>{a.number} - {a.name}</option>)}</select></div>
        <div><Label>Cuenta al terminar</Label><select disabled={!typeInfo.capitalizable} value={form.completionAccountCode} onChange={e=>{const a=accounts.find(x=>x.number===e.target.value);setForm({...form,completionAccountCode:e.target.value,completionAccountName:a?.name||''})}} className="w-full p-2 border rounded-lg disabled:bg-slate-100">{accounts.filter(a=>String(a.number||'').startsWith('15')).map(a=><option key={a.id} value={a.number}>{a.number} - {a.name}</option>)}</select></div>
        <div className="flex gap-5 items-center">
          <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={form.vatResponsible} onChange={e=>setForm({...form,vatResponsible:e.target.checked})}/> Contratista responsable de IVA</label>
          <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={form.vatWithholdingAgent} onChange={e=>setForm({...form,vatWithholdingAgent:e.target.checked})}/> Practicar reteIVA</label>
        </div>
        <div><Label>Tratamiento contable del IVA</Label><select value={form.vatTreatment} onChange={e=>setForm({...form,vatTreatment:e.target.value})} className="w-full p-2 border rounded-lg"><option value="cost">Mayor valor del costo / activo</option><option value="deductible">IVA descontable (2408)</option></select></div>
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
    contractor: { type: contract.contractorIsNatural ? 'person' : 'company', declarant: contract.contractorIsDeclarant, forceHonorarios11: contract.contractorHonorarios11 },
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
        <div><Label>Tipo de acta *</Label><select value={form.type} onChange={e=>{const info=ACT_TYPES.find(x=>x.key===e.target.value);setForm({...form,type:e.target.value,title:info?.label||form.title,grossValue:info?.financial?form.grossValue:''})}} className="w-full p-2 border rounded-lg">{ACT_TYPES.map(a=><option key={a.key} value={a.key}>{a.label}</option>)}</select></div>
        <div><Label>Número de acta *</Label><input required value={form.number} onChange={e=>setForm({...form,number:e.target.value})} className="w-full p-2 border rounded-lg" placeholder="ACT-001"/></div>
        <div><Label>Fecha *</Label><input required type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
        <div><Label>Título</Label><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
        {ACT_TYPES.find(x=>x.key===form.type)?.financial&&<div><Label>Valor ejecutado / base *</Label><input required type="number" min="0" value={form.grossValue} onChange={e=>setForm({...form,grossValue:e.target.value})} className="w-full p-2 border rounded-lg"/></div>}
        {ACT_TYPES.find(x=>x.key===form.type)?.financial&&<><div><Label>{type.vatMode === 'construction-profit' ? 'Base IVA · honorarios/utilidad' : 'Base IVA (vacío = valor ejecutado)'}</Label><input type="number" min="0" value={form.vatBase} onChange={e=>setForm({...form,vatBase:e.target.value})} className="w-full p-2 border rounded-lg"/>{type.vatMode === 'construction-profit' && contract.vatResponsible && <p className="text-xs text-amber-700 mt-1">En obra sobre inmueble, indica los honorarios o utilidad que constituyen la base del IVA.</p>}</div>
        <div><Label>Amortización anticipo</Label><input type="number" min="0" max={remainingAdvance} value={form.amortization} onChange={e=>setForm({...form,amortization:e.target.value})} placeholder={String(Math.round(suggestedAmortization))} className="w-full p-2 border rounded-lg"/></div></>}
        <div className="md:col-span-2"><Label>Descripción / alcance</Label><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="w-full p-2 border rounded-lg" rows="2"/></div>
        {ACT_TYPES.find(x=>x.key===form.type)?.financial&&<><div className="md:col-span-2 bg-slate-50 border rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><span className="text-slate-500">IVA</span><p className="font-bold">{money(taxes.vat)}</p></div>
          <div><span className="text-slate-500">Retefuente</span><p className="font-bold text-red-600">-{money(taxes.incomeWithholding)}</p></div>
          <div><span className="text-slate-500">ReteIVA + ICA</span><p className="font-bold text-red-600">-{money(taxes.reteIva+taxes.reteIca)}</p></div>
          <div><span className="text-slate-500">Neto CxP</span><p className="font-black text-blue-700">{money(netPayable)}</p></div>
        </div>
        <div className="md:col-span-2 text-xs text-slate-500">{taxes.rule.label}: {taxes.retentionRate.toFixed(2)}% · Base mínima {taxes.threshold ? money(taxes.threshold) : 'sin mínimo configurado'} · Regla {taxes.rule.taxConcept} · versión CO-2026-05-08.</div></>}
      </div>
      <div className="p-5 border-t flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit">Registrar y contabilizar</Button></div>
    </form>
  </div>;
};

const AddendumModal = ({ open, onClose, onSave, contract }) => {
  const [form, setForm] = useState(defaultAddendum);
  if (!open || !contract) return null;
  const submit = e => { e.preventDefault(); onSave({ ...form, amountChange:Number(form.amountChange)||0 }); setForm(defaultAddendum); };
  return <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4">
    <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
      <div className="p-5 border-b flex justify-between"><div><h2 className="text-xl font-bold">Otrosí / Modificación</h2><p className="text-sm text-slate-500">Contrato {contract.number}</p></div><button type="button" onClick={onClose}><X className="w-5 h-5"/></button></div>
      <div className="p-6 grid md:grid-cols-2 gap-4">
        <div><Label>Número *</Label><input required value={form.number} onChange={e=>setForm({...form,number:e.target.value})} className="w-full p-2 border rounded-lg" placeholder="OT-001"/></div>
        <div><Label>Fecha *</Label><input required type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
        <div><Label>Tipo *</Label><select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})} className="w-full p-2 border rounded-lg"><option value="addition">Adición de valor</option><option value="extension">Prórroga</option><option value="reduction">Reducción de valor</option><option value="modification">Modificación de condiciones</option><option value="suspension">Suspensión</option><option value="restart">Reinicio</option></select></div>
        <div><Label>Variación de valor</Label><input type="number" value={form.amountChange} onChange={e=>setForm({...form,amountChange:e.target.value})} className="w-full p-2 border rounded-lg" placeholder="Use negativo para reducción"/></div>
        <div><Label>Nueva fecha de terminación</Label><input type="date" value={form.newEndDate} onChange={e=>setForm({...form,newEndDate:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
        <div className="md:col-span-2"><Label>Descripción / justificación *</Label><textarea required rows="3" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
      </div>
      <div className="p-5 border-t flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit"><Save className="w-4 h-4 mr-2"/>Guardar otrosí</Button></div>
    </form>
  </div>;
};

const GuaranteeModal = ({ open, onClose, onSave, contract }) => {
  const [form, setForm] = useState(defaultGuarantee);
  if (!open || !contract) return null;
  const submit = e => { e.preventDefault(); onSave({ ...form, amount:Number(form.amount)||0 }); setForm(defaultGuarantee); };
  return <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4">
    <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
      <div className="p-5 border-b flex justify-between"><div><h2 className="text-xl font-bold">Garantía / Póliza</h2><p className="text-sm text-slate-500">Contrato {contract.number}</p></div><button type="button" onClick={onClose}><X className="w-5 h-5"/></button></div>
      <div className="p-6 grid md:grid-cols-2 gap-4">
        <div><Label>Tipo *</Label><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className="w-full p-2 border rounded-lg"><option>Cumplimiento</option><option>Calidad</option><option>Estabilidad de obra</option><option>Responsabilidad civil</option><option>Salarios y prestaciones</option><option>Buen manejo del anticipo</option><option>Otra</option></select></div>
        <div><Label>Número de póliza *</Label><input required value={form.policyNumber} onChange={e=>setForm({...form,policyNumber:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
        <div><Label>Aseguradora</Label><input value={form.insurer} onChange={e=>setForm({...form,insurer:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
        <div><Label>Valor asegurado</Label><input type="number" min="0" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
        <div><Label>Vigente desde</Label><input type="date" value={form.validFrom} onChange={e=>setForm({...form,validFrom:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
        <div><Label>Vigente hasta *</Label><input required type="date" value={form.validTo} onChange={e=>setForm({...form,validTo:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
        <div className="md:col-span-2"><Label>Observaciones</Label><textarea rows="2" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} className="w-full p-2 border rounded-lg"/></div>
      </div>
      <div className="p-5 border-t flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit"><ShieldCheck className="w-4 h-4 mr-2"/>Guardar póliza</Button></div>
    </form>
  </div>;
};

const Contracts = () => {
  const { activeCompany } = useCompany(); const { canAdd, canEdit } = usePermission(); const { toast } = useToast();
  const [contracts, saveContracts] = useCompanyData('contracts');
  const [transactions, saveTransactions] = useCompanyData('transactions'); const [accountsPayable, saveAccountsPayable] = useCompanyData('accountsPayable');
  const [contacts] = useCompanyData('contacts'); const [accounts] = useCompanyData('accounts');
  const [bankAccounts] = useCompanyData('bankAccounts'); const [cashAccounts] = useCompanyData('cash_accounts');
  const [contractOpen, setContractOpen] = useState(false); const [actOpen, setActOpen] = useState(false); const [addendumOpen, setAddendumOpen] = useState(false); const [guaranteeOpen, setGuaranteeOpen] = useState(false); const [selectedId, setSelectedId] = useState(null);
  const [advanceSource, setAdvanceSource] = useState('caja_principal|CAJA PRINCIPAL');
  const selected = (contracts||[]).find(c=>c.id===selectedId) || null;
  const selectedActs = [...(selected?.acts || [])].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const totals = useMemo(() => ({ executed:selectedActs.reduce((s,a)=>s+Number(a.grossValue||0),0), amortized:selectedActs.reduce((s,a)=>s+Number(a.amortization||0),0), withheld:selectedActs.reduce((s,a)=>s+Number(a.tax?.totalWithholdings||0),0) }), [selectedActs]);
  const selectedValue = selected ? effectiveContractValue(selected) : 0;
  const selectedEndDate = selected ? effectiveEndDate(selected) : '';
  const remainingAdvance = selected ? Math.max(0, Number(selected.advanceValue||0)-Number(selected.amortizedAdvance||0)) : 0;
  const selectedPayables = (accountsPayable||[]).filter(p=>p.contractId===selectedId);
  const pendingPayables = selectedPayables.filter(p=>p.status!=='Pagado');
  const pendingTaxActs = selectedActs.filter(a=>Number(a.tax?.totalWithholdings||0)>0&&a.taxStatus!=='paid');
  const hasFinalAct = selectedActs.some(a=>a.type==='final_delivery');
  const requiresCapitalization = !!selected && getContractType(selected.type).capitalizable;
  const closeoutChecks = selected ? [
    { key:'final', label:'Acta de entrega/recibo final', ok:hasFinalAct },
    { key:'advance', label:'Anticipo totalmente amortizado', ok:remainingAdvance<1 },
    { key:'payables', label:'Sin cuentas por pagar pendientes', ok:pendingPayables.length===0 },
    { key:'tax', label:'Retenciones declaradas/pagadas', ok:pendingTaxActs.length===0 },
    { key:'capital', label:'Activo capitalizado cuando corresponde', ok:!requiresCapitalization||!!selected.capitalizedAt },
  ] : [];
  const canLiquidate = !!selected && closeoutChecks.every(x=>x.ok);

  const createContract = data => {
    if((contracts||[]).some(c=>String(c.number).toLowerCase()===String(data.number).toLowerCase())){toast({variant:'destructive',title:'Contrato duplicado',description:'Ya existe un expediente con ese número.'});return;}
    const advanceValue=(Number(data.value)||0)*(Number(data.advancePct)||0)/100;
    const row={...data,id:idNow('contract'),advanceValue,amortizedAdvance:0,advancePosted:false,acts:[],amendments:[],guarantees:[],status:'Vigente',statusHistory:[{status:'Vigente',date:new Date().toISOString(),note:'Contrato creado'}],createdAt:new Date().toISOString()};
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
    const isFinancialAct=!!ACT_TYPES.find(x=>x.key===data.type)?.financial;
    if((selected.acts||[]).some(a=>String(a.number).toLowerCase()===String(data.number).toLowerCase())){toast({variant:'destructive',title:'Número de acta duplicado',description:'Ese número ya existe dentro de este contrato.'});return;}
    if(isFinancialAct && totals.executed+Number(data.grossValue||0)>selectedValue+1){toast({variant:'destructive',title:'Valor excede el contrato vigente',description:'Registra primero un otrosí de adición o corrige el valor del acta.'});return;}
    if(Number(data.amortization||0)>remainingAdvance+1){toast({variant:'destructive',title:'Amortización inválida',description:'La amortización supera el saldo pendiente del anticipo.'});return;}
    const act={...data,tax:data.taxes,id:idNow('act'),contractId:selected.id,contractNumber:selected.number,contractorName:selected.contractorName,createdAt:new Date().toISOString()};
    const isFinancial=!!ACT_TYPES.find(x=>x.key===data.type)?.financial && Number(data.grossValue||0)>0;
    const voucherNumber=isFinancial?nextTransferVoucher(data.date):null; const accounting=[]; const invoiceTotal=Number(data.taxes.invoiceTotal||0);
    if(isFinancial){
      const baseAmount=Number(data.taxes.base||data.grossValue||0); const vatAmount=Number(data.taxes.vat||0);
      if(selected.vatTreatment==='deductible'&&vatAmount>0){
        accounting.push(createAccountingTransaction({date:data.date,amount:baseAmount,actId:act.id,description:'Base acta '+data.number+' · Contrato '+selected.number+' · '+selected.object,debit:{code:selected.executionAccountCode,name:selected.executionAccountName},credit:{code:'23050101',name:'CUENTAS POR PAGAR'}},voucherNumber));
        accounting.push(createAccountingTransaction({date:data.date,amount:vatAmount,actId:act.id,description:'IVA descontable · Acta '+data.number+' · Contrato '+selected.number,debit:{code:'2408',name:'IVA DESCONTABLE'},credit:{code:'23050101',name:'CUENTAS POR PAGAR'}},voucherNumber));
      }else{
        accounting.push(createAccountingTransaction({date:data.date,amount:invoiceTotal,actId:act.id,description:'Acta '+data.number+' · Contrato '+selected.number+' · '+selected.object,debit:{code:selected.executionAccountCode,name:selected.executionAccountName},credit:{code:'23050101',name:'CUENTAS POR PAGAR'}},voucherNumber));
      }
      [['incomeWithholding','2365','RETENCIÓN EN LA FUENTE'],['reteIva','2367','RETENCIÓN DE IVA'],['reteIca','2368','RETENCIÓN ICA']].forEach(item=>{
        const amount=Number(data.taxes[item[0]]||0); if(amount<=0)return;
        accounting.push(createAccountingTransaction({date:data.date,amount,actId:act.id,description:item[2]+' · Acta '+data.number+' · Contrato '+selected.number,debit:{code:'23050101',name:'CUENTAS POR PAGAR'},credit:{code:item[1],name:item[2]}},voucherNumber));
      });
      if(Number(data.amortization)>0) accounting.push(createAccountingTransaction({date:data.date,amount:Number(data.amortization),actId:act.id,description:'Amortización de anticipo · Acta '+data.number+' · Contrato '+selected.number,debit:{code:'23050101',name:'CUENTAS POR PAGAR'},credit:{code:'133005',name:'ANTICIPOS Y AVANCES'}},voucherNumber));
      const payable={id:idNow('payable-contract'),supplier:selected.contractorName,description:'Contrato '+selected.number+' · Acta '+data.number,issueDate:data.date,dueDate:data.date,amount:data.netPayable,linkedAccount:'23050101',status:'Pendiente',contractManaged:true,contractId:selected.id,contractActId:act.id,contactId:selected.contractorId,company_id:activeCompany?.id,companyId:activeCompany?.id};
      saveTransactions([...(transactions||[]),...accounting]); saveAccountsPayable([...(accountsPayable||[]),payable]);
    }
    const statusFromAct=data.type==='suspension'?'Suspendido':data.type==='restart'?'Vigente':data.type==='final_delivery'?'Terminado':selected.status;
    saveContracts((contracts||[]).map(c=>c.id===selected.id?{...c,acts:[...(c.acts||[]),act],status:statusFromAct,statusHistory:statusFromAct!==c.status?[...(c.statusHistory||[]),{status:statusFromAct,date:new Date().toISOString(),note:actTypeLabel(data.type)+' '+data.number}]:c.statusHistory,amortizedAdvance:Number(c.amortizedAdvance||0)+Number(data.amortization||0)}:c));
    setActOpen(false); toast({title:isFinancial?'Acta contabilizada':'Acta registrada',description:isFinancial?'Comprobante T-'+String(voucherNumber).padStart(4,'0')+', CxP y retenciones vinculadas al expediente.':'Acta documental incorporada al expediente sin generar movimiento contable.'});
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

  const saveAddendum = data => {
    if(!selected)return;
    const amendment={...data,id:idNow('addendum'),createdAt:new Date().toISOString()};
    const nextStatus=data.kind==='suspension'?'Suspendido':data.kind==='restart'?'Vigente':selected.status;
    saveContracts((contracts||[]).map(c=>c.id===selected.id?{...c,amendments:[...(c.amendments||[]),amendment],status:nextStatus,statusHistory:nextStatus!==c.status?[...(c.statusHistory||[]),{status:nextStatus,date:new Date().toISOString(),note:'Otrosí '+data.number}]:c.statusHistory}:c));
    setAddendumOpen(false); toast({title:'Otrosí registrado',description:'La modificación quedó incorporada al expediente sin alterar el valor original del contrato.'});
  };

  const saveGuarantee = data => {
    if(!selected)return;
    const guarantee={...data,id:idNow('policy'),createdAt:new Date().toISOString()};
    saveContracts((contracts||[]).map(c=>c.id===selected.id?{...c,guarantees:[...(c.guarantees||[]),guarantee]}:c));
    setGuaranteeOpen(false); toast({title:'Póliza registrada',description:'La garantía quedó vinculada al contrato y será vigilada por fecha de vencimiento.'});
  };

  const capitalize = () => {
    if(!selected||!getContractType(selected.type).capitalizable||totals.executed<=0||selected.status==='Liquidado')return;
    if(!hasFinalAct){toast({variant:'destructive',title:'Falta acta final',description:'Para capitalizar la obra registra primero el Acta de Recibo / Entrega Final.'});return;}
    const date=todayIso(); const voucherNumber=nextTransferVoucher(date);
    const txn=createAccountingTransaction({date,amount:totals.executed,actId:null,description:'Capitalización / cierre Contrato '+selected.number+': '+selected.object,debit:{code:selected.completionAccountCode,name:selected.completionAccountName},credit:{code:selected.executionAccountCode,name:selected.executionAccountName}},voucherNumber);
    saveTransactions([...(transactions||[]),txn]); saveContracts((contracts||[]).map(c=>c.id===selected.id?{...c,status:c.status==='Liquidado'?'Liquidado':'Terminado',capitalizedAt:new Date().toISOString(),capitalizationTransactionId:txn.id,statusHistory:[...(c.statusHistory||[]),{status:c.status==='Liquidado'?'Liquidado':'Terminado',date:new Date().toISOString(),note:'Activo capitalizado'}]}:c));
    toast({title:'Contrato capitalizado',description:'Se generó el comprobante T-'+String(voucherNumber).padStart(4,'0')+' y el cruce hacia el activo definitivo. El contrato queda listo para liquidación cuando complete el cierre.'});
  };

  const markTaxPaid = actId => {
    if(!selected)return;
    saveContracts((contracts||[]).map(c=>c.id===selected.id?{...c,acts:(c.acts||[]).map(a=>a.id===actId?{...a,taxStatus:'paid',taxPaidAt:new Date().toISOString()}:a)}:c));
    toast({title:'Retención actualizada',description:'La obligación del acta quedó marcada como declarada/pagada y sale de las alertas pendientes.'});
  };

  const liquidateContract = () => {
    if(!selected || !canLiquidate)return;
    const stamp=new Date().toISOString();
    const liquidationAct={id:idNow('act-liquidation'),type:'liquidation',number:'LIQ-'+selected.number,date:todayIso(),title:'Acta de Liquidación',grossValue:0,amortization:0,netPayable:0,tax:{totalWithholdings:0},description:'Liquidación contractual luego de verificar cierre financiero, tributario y documental.',contractId:selected.id,contractNumber:selected.number,contractorName:selected.contractorName,createdAt:stamp};
    saveContracts((contracts||[]).map(c=>c.id===selected.id?{...c,status:'Liquidado',liquidatedAt:stamp,acts:[...(c.acts||[]),liquidationAct],statusHistory:[...(c.statusHistory||[]),{status:'Liquidado',date:stamp,note:'Cierre contractual completo'}]}:c));
    toast({title:'Contrato liquidado',description:'El expediente superó el checklist de cierre y quedó formalmente liquidado.'});
  };

  const printSettlement = contract => {
    const acts=contract.acts||[]; const executed=acts.reduce((s,a)=>s+Number(a.grossValue||0),0); const amortized=acts.reduce((s,a)=>s+Number(a.amortization||0),0); const withheld=acts.reduce((s,a)=>s+Number(a.tax?.totalWithholdings||0),0);
    const doc=new jsPDF(); addPdfHeader(doc,activeCompany,'ACTA DE LIQUIDACIÓN · '+contract.number); let y=43;
    y=pageText(doc,'CONTRATISTA: '+contract.contractorName+' · '+(contract.contractorDoc||''),18,y); y=pageText(doc,'OBJETO: '+contract.object,18,y); y=pageText(doc,'VALOR INICIAL: '+money(contract.value)+' · VALOR FINAL: '+money(effectiveContractValue(contract)),18,y); y=pageText(doc,'PLAZO FINAL: '+contract.startDate+' a '+(effectiveEndDate(contract)||'—'),18,y);
    y=pageText(doc,'VALOR EJECUTADO CERTIFICADO: '+money(executed),18,y); y=pageText(doc,'ANTICIPO ENTREGADO: '+money(contract.advanceValue)+' · AMORTIZADO: '+money(amortized),18,y); y=pageText(doc,'RETENCIONES PRACTICADAS: '+money(withheld),18,y);
    y+=4; y=pageText(doc,'DECLARACIÓN DE CIERRE',18,y,175,11); y=pageText(doc,'Las partes dejan constancia de la terminación de las obligaciones registradas en el expediente contractual, sujeto a los soportes, garantías y responsabilidades que por su naturaleza sobrevivan a la liquidación.',18,y);
    y+=22; doc.text('CONTRATANTE / SUPERVISOR',28,y); doc.text('CONTRATISTA',138,y); doc.line(18,y+12,92,y+12); doc.line(115,y+12,190,y+12); doc.save('Liquidacion_'+contract.number+'.pdf');
  };

  const printPortfolio = () => {
    const doc=new jsPDF(); addPdfHeader(doc,activeCompany,'REPORTE GENERAL DE CONTRATOS'); let y=44;
    (contracts||[]).forEach((c,index)=>{ if(y>270){doc.addPage(); y=20;} doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.text((index+1)+'. '+c.number+' · '+getContractType(c.type).label,18,y); doc.setFont('helvetica','normal'); y+=5; y=pageText(doc,c.contractorName+' · '+money(effectiveContractValue(c))+' · '+c.status,22,y,168,9); y=pageText(doc,c.object,22,y,168,9); y+=2; });
    doc.save('Reporte_Contratos_'+todayIso()+'.pdf');
  };

  const printAddendum = amendment => {
    if(!selected)return; const doc=new jsPDF(); addPdfHeader(doc,activeCompany,'OTROSÍ '+amendment.number+' · '+selected.number); let y=43;
    y=pageText(doc,'CONTRATISTA: '+selected.contractorName+' · '+(selected.contractorDoc||''),18,y); y=pageText(doc,'OBJETO DEL CONTRATO: '+selected.object,18,y); y=pageText(doc,'FECHA DEL OTROSÍ: '+amendment.date,18,y); y=pageText(doc,'TIPO DE MODIFICACIÓN: '+amendment.kind,18,y);
    if(Number(amendment.amountChange||0)!==0)y=pageText(doc,'VARIACIÓN DE VALOR: '+money(amendment.amountChange)+' · VALOR VIGENTE RESULTANTE: '+money(effectiveContractValue(selected)),18,y);
    if(amendment.newEndDate)y=pageText(doc,'NUEVA FECHA DE TERMINACIÓN: '+amendment.newEndDate,18,y);
    y+=5; doc.setFont('helvetica','bold'); y=pageText(doc,'MODIFICACIÓN ACORDADA',18,y,175,10); doc.setFont('helvetica','normal'); y=pageText(doc,amendment.description,18,y,175,9); y+=20; doc.text('CONTRATANTE',28,y); doc.text('CONTRATISTA',138,y); doc.line(18,y+12,92,y+12); doc.line(115,y+12,190,y+12); doc.save('Otrosi_'+amendment.number+'_Contrato_'+selected.number+'.pdf');
  };

  const printContract = contract => {
    const doc=new jsPDF(); addPdfHeader(doc,activeCompany,'CONTRATO '+contract.number); let y=43;
    const section=(title,text)=>{ if(y>250){doc.addPage(); y=22;} doc.setFont('helvetica','bold'); y=pageText(doc,title,18,y,175,10); doc.setFont('helvetica','normal'); y=pageText(doc,text,18,y,175,9); y+=2; };
    y=pageText(doc,'CONTRATANTE: '+(activeCompany?.name||'ENTIDAD')+' · NIT '+(activeCompany?.doc||'—'),18,y);
    y=pageText(doc,'CONTRATISTA: '+contract.contractorName+' · '+(contract.contractorDoc||'')+(contract.contractorAddress?' · '+contract.contractorAddress:''),18,y);
    y=pageText(doc,'TIPO: '+getContractType(contract.type).label,18,y); y=pageText(doc,'LUGAR DE EJECUCIÓN: '+(contract.executionPlace||'Según objeto contractual'),18,y);
    section('PRIMERA. OBJETO',contract.object);
    section('SEGUNDA. VALOR','El valor vigente del contrato es '+money(effectiveContractValue(contract))+'. Valor inicial: '+money(contract.value)+'. Los otrosíes válidamente registrados forman parte integral del expediente.');
    section('TERCERA. PLAZO','La ejecución inicia el '+contract.startDate+' y finaliza el '+(effectiveEndDate(contract)||'plazo por definir')+', sin perjuicio de prórrogas, suspensiones o reinicios formalmente documentados.');
    section('CUARTA. FORMA DE PAGO',contract.paymentTerms||'Pago contra actas aprobadas y soportes válidos.');
    section('QUINTA. ANTICIPO Y AMORTIZACIÓN','Anticipo pactado: '+(contract.advancePct||0)+'% por '+money(contract.advanceValue)+'. Cuando exista anticipo, su amortización se realizará conforme a las actas y registros del expediente hasta extinguir el saldo.');
    section('SEXTA. OBLIGACIONES Y SUPERVISIÓN','El contratista ejecutará el objeto con diligencia, calidad y oportunidad, conservará los soportes exigibles y atenderá las observaciones del supervisor. Supervisor o responsable: '+(contract.supervisor||'por designar')+'.');
    section('SÉPTIMA. IMPUESTOS, RETENCIONES Y DESCUENTOS','Los pagos o abonos en cuenta estarán sujetos a los impuestos, retenciones y descuentos legalmente aplicables según la naturaleza real de la operación, el RUT del tercero y la calidad tributaria de las partes. Los cálculos del sistema son soporte operativo y deben corresponder a los documentos tributarios del expediente.');
    section('OCTAVA. GARANTÍAS, ACTAS Y MODIFICACIONES','Las garantías, pólizas, actas de inicio, avance, suspensión, reinicio, recibo final, liquidación y otrosíes registrados en el expediente forman parte del control contractual. Las obligaciones que por su naturaleza sobrevivan a la terminación conservarán su vigencia.');
    section('NOVENA. TERMINACIÓN Y LIQUIDACIÓN','El contrato podrá cerrarse cuando se encuentren conciliados los valores ejecutados, anticipos, cuentas por pagar, retenciones, soportes y, cuando corresponda, la capitalización del activo. La liquidación se documentará mediante acta.');
    if(y>240){doc.addPage();y=35;} y+=16; doc.setFontSize(9); doc.text('Por el CONTRATANTE',30,y); doc.text('Por el CONTRATISTA',130,y); y+=14; doc.line(18,y,92,y); doc.line(112,y,192,y); y+=5; doc.text(activeCompany?.name||'ENTIDAD',18,y); doc.text(contract.contractorName||'',112,y); y+=5; doc.text('Supervisor: '+(contract.supervisor||'________________'),18,y);
    doc.save('Contrato_'+contract.number+'.pdf');
  };
  const printAct = act => {
    const contract=(contracts||[]).find(c=>c.id===act.contractId); if(!contract)return; const doc=new jsPDF(); addPdfHeader(doc,activeCompany,actTypeLabel(act.type)+' · '+act.number); let y=43;
    y=pageText(doc,'CONTRATO: '+contract.number,18,y); y=pageText(doc,'OBJETO: '+contract.object,18,y); y=pageText(doc,'CONTRATISTA: '+contract.contractorName+' · '+(contract.contractorDoc||''),18,y);
    y=pageText(doc,'SUPERVISOR / RESPONSABLE: '+(contract.supervisor||'—'),18,y); y=pageText(doc,'FECHA: '+act.date+' · LUGAR: '+(contract.executionPlace||'según contrato'),18,y);
    y+=3; doc.setFont('helvetica','bold'); y=pageText(doc,'DESARROLLO Y CONSTANCIA',18,y,175,10); doc.setFont('helvetica','normal'); y=pageText(doc,act.description||'Las partes dejan constancia de lo correspondiente al estado de ejecución del contrato.',18,y,175,9);
    if(ACT_TYPES.find(x=>x.key===act.type)?.financial){ y+=3; doc.setFont('helvetica','bold'); y=pageText(doc,'RESUMEN ECONÓMICO',18,y,175,10); doc.setFont('helvetica','normal'); y=pageText(doc,'Valor ejecutado: '+money(act.grossValue)+' · IVA: '+money(act.tax?.vat),18,y,175,9); y=pageText(doc,'Retefuente: '+money(act.tax?.incomeWithholding)+' · ReteIVA: '+money(act.tax?.reteIva)+' · ReteICA: '+money(act.tax?.reteIca),18,y,175,9); y=pageText(doc,'Amortización de anticipo: '+money(act.amortization)+' · Neto a pagar: '+money(act.netPayable),18,y,175,9); }
    if(act.type==='final_delivery'){y+=3;y=pageText(doc,'Con la suscripción de esta acta se deja constancia del recibo o entrega final registrada en el expediente, sin perjuicio de garantías, responsabilidades pendientes y liquidación contractual.',18,y,175,9);}
    if(act.type==='suspension'){y+=3;y=pageText(doc,'La ejecución queda suspendida desde la fecha indicada hasta que exista acta de reinicio o decisión documentada que modifique esta situación.',18,y,175,9);}
    if(act.type==='restart'){y+=3;y=pageText(doc,'La ejecución contractual se reinicia desde la fecha indicada, conforme a las condiciones vigentes del expediente.',18,y,175,9);}
    y+=22; doc.setFontSize(9); doc.text('SUPERVISOR / CONTRATANTE',25,y); doc.text('CONTRATISTA',135,y); doc.line(18,y+12,92,y+12); doc.line(115,y+12,190,y+12); doc.save('Acta_'+act.number+'_Contrato_'+contract.number+'.pdf');
  };

  const alerts=(contracts||[]).flatMap(contract=>(contract.acts||[]).filter(act=>Number(act.tax?.totalWithholdings||0)>0 && act.taxStatus!=='paid').map(act=>({id:act.id,description:'Contrato '+contract.number+' · Acta '+act.number,amount:Number(act.tax?.totalWithholdings||0),...getRetentionAlert(act.date,activeCompany?.doc)}))).filter(a=>a.dueDate).sort((a,b)=>(a.days??999)-(b.days??999));
  const operationalAlerts=(contracts||[]).flatMap(contract=>{
    const rows=[]; const end=effectiveEndDate(contract); const endDays=daysToDate(end);
    if(contract.status!=='Liquidado'&&end&&endDays!=null&&endDays<=30) rows.push({id:'end-'+contract.id,kind:'contract',days:endDays,text:'Contrato '+contract.number+' vence '+(endDays<0?'hace '+Math.abs(endDays)+' día(s)':'en '+endDays+' día(s)')});
    (contract.guarantees||[]).forEach(g=>{const days=daysToDate(g.validTo); if(days!=null&&days<=30)rows.push({id:g.id,kind:'policy',days,text:'Póliza '+g.policyNumber+' · '+contract.number+' '+(days<0?'venció hace '+Math.abs(days)+' día(s)':'vence en '+days+' día(s)')});});
    return rows;
  }).sort((a,b)=>(a.days??999)-(b.days??999));

  return <>
    <Helmet><title>Contratos - JaiderHerTur26</title></Helmet>
    <div className="space-y-6">
      <motion.div initial={{opacity:0,y:-15}} animate={{opacity:1,y:0}} className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div><h1 className="text-4xl font-bold text-slate-900">Contratos</h1><p className="text-slate-600">Contratación, actas, anticipos, retenciones, garantías y cierre integrado.</p></div>
        <div className="flex flex-wrap gap-2">{(contracts||[]).length>0&&<Button variant="outline" onClick={printPortfolio}><Printer className="w-4 h-4 mr-2"/>Reporte PDF</Button>}{canAdd&&<Button onClick={()=>setContractOpen(true)}><Plus className="w-4 h-4 mr-2"/>Nuevo Contrato</Button>}</div>
      </motion.div>

      {alerts.length>0&&<div className="bg-amber-50 border border-amber-200 rounded-xl p-4"><div className="flex items-center gap-2 font-bold text-amber-900 mb-2"><AlertTriangle className="w-5 h-5"/>Obligaciones tributarias pendientes</div><div className="grid md:grid-cols-2 gap-2">{alerts.slice(0,4).map(a=><div key={a.id} className="bg-white border rounded-lg p-3 text-sm"><div className="font-semibold">{a.description}</div><div className={a.days<0?'text-red-600 font-bold':'text-amber-700'}>{a.dueDate?(a.days<0?'Vencida hace '+Math.abs(a.days)+' día(s)':'Vence en '+a.days+' día(s) · '+a.dueDate):'Fecha pendiente de validación DIAN'}</div><div>{money(a.amount)}</div></div>)}</div></div>}
      {operationalAlerts.length>0&&<div className="bg-rose-50 border border-rose-200 rounded-xl p-4"><div className="flex items-center gap-2 font-bold text-rose-900 mb-2"><CalendarDays className="w-5 h-5"/>Alertas contractuales y pólizas</div><div className="grid md:grid-cols-2 gap-2">{operationalAlerts.slice(0,6).map(a=><div key={a.id} className="bg-white border rounded-lg p-3 text-sm"><div className={a.days<0?'font-bold text-red-700':'font-semibold text-rose-800'}>{a.text}</div></div>)}</div></div>}
      <div className="grid lg:grid-cols-[360px_1fr] gap-5">
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden"><div className="p-4 border-b font-bold">Expedientes ({(contracts||[]).length})</div><div className="max-h-[70vh] overflow-y-auto divide-y">{(contracts||[]).length===0?<div className="p-8 text-center text-slate-500">Aún no hay contratos.</div>:(contracts||[]).map(c=><button key={c.id} onClick={()=>setSelectedId(c.id)} className={'w-full text-left p-4 hover:bg-slate-50 '+(selectedId===c.id?'bg-blue-50 border-l-4 border-blue-600':'')}><div className="flex justify-between gap-2"><span className="font-bold">{c.number}</span><span className={'text-xs px-2 py-0.5 rounded-full '+(c.status==='Liquidado'?'bg-green-100 text-green-700':'bg-blue-100 text-blue-700')}>{c.status}</span></div><div className="text-sm mt-1 line-clamp-2">{c.object}</div><div className="text-xs text-slate-500 mt-1">{c.contractorName} · {money(effectiveContractValue(c))}</div></button>)}</div></div>
        <div className="space-y-5">{!selected?<div className="bg-white rounded-xl border p-12 text-center text-slate-500"><FileSignature className="w-14 h-14 mx-auto text-slate-300 mb-3"/><p>Selecciona o crea un contrato para abrir su expediente.</p></div>:<>
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <div className="flex flex-col md:flex-row justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-2xl font-black">{selected.number}</h2><span className="text-xs px-2 py-1 bg-slate-100 rounded">{getContractType(selected.type).label}</span></div><p className="text-slate-600 mt-1">{selected.object}</p><p className="text-sm text-slate-500 mt-1">{selected.contractorName}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>printContract(selected)}><Printer className="w-4 h-4 mr-2"/>Contrato PDF</Button>{canAdd&&selected.status!=='Liquidado'&&<Button variant="outline" onClick={()=>setAddendumOpen(true)}><FilePlus2 className="w-4 h-4 mr-2"/>Otrosí</Button>}{canAdd&&selected.status!=='Liquidado'&&<Button variant="outline" onClick={()=>setGuaranteeOpen(true)}><ShieldCheck className="w-4 h-4 mr-2"/>Póliza</Button>}{canAdd&&selected.status!=='Liquidado'&&<Button onClick={()=>setActOpen(true)}><ClipboardList className="w-4 h-4 mr-2"/>Nueva Acta</Button>}{canEdit&&getContractType(selected.type).capitalizable&&selected.status!=='Liquidado'&&totals.executed>0&&!selected.capitalizedAt&&<Button variant="outline" onClick={capitalize}><ArrowRightLeft className="w-4 h-4 mr-2"/>Capitalizar</Button>}{selected.status==='Liquidado'&&<Button variant="outline" onClick={()=>printSettlement(selected)}><Printer className="w-4 h-4 mr-2"/>Liquidación PDF</Button>}</div></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5"><div className="bg-slate-50 rounded-lg p-3"><span className="text-xs text-slate-500">Valor vigente</span><p className="font-black">{money(selectedValue)}</p><p className="text-[11px] text-slate-500">Inicial {money(selected.value)}</p></div><div className="bg-slate-50 rounded-lg p-3"><span className="text-xs text-slate-500">Ejecutado</span><p className="font-black">{money(totals.executed)}</p></div><div className="bg-slate-50 rounded-lg p-3"><span className="text-xs text-slate-500">Anticipo / amortizado</span><p className="font-black">{money(selected.advanceValue)} / {money(totals.amortized)}</p></div><div className="bg-slate-50 rounded-lg p-3"><span className="text-xs text-slate-500">Retenciones acumuladas</span><p className="font-black text-red-600">{money(totals.withheld)}</p></div></div>
            <div className="mt-4"><div className="flex justify-between text-xs text-slate-500 mb-1"><span>Ejecución contractual</span><span>{selectedValue>0?Math.min(100,(totals.executed/selectedValue)*100).toFixed(1):'0.0'}%</span></div><div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-blue-600" style={{width:(selectedValue>0?Math.min(100,(totals.executed/selectedValue)*100):0)+'%'}}/></div></div>
            {Number(selected.advanceValue||0)>0&&!selected.advancePosted&&selected.status!=='Liquidado'&&<div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-3 flex flex-col md:flex-row gap-3 md:items-end"><div className="flex-1"><Label>Cuenta desde la que se paga el anticipo</Label><select value={advanceSource} onChange={e=>setAdvanceSource(e.target.value)} className="w-full p-2 border rounded-lg bg-white"><option value="caja_principal|CAJA PRINCIPAL">CAJA PRINCIPAL</option>{(cashAccounts||[]).map(c=><option key={c.id} value={c.id+'|'+c.name}>{c.name}</option>)}{(bankAccounts||[]).map(b=><option key={b.id} value={b.id+'|'+(b.bankName||b.name)}>{b.bankName||b.name}</option>)}</select></div><Button onClick={postAdvance}><BadgeDollarSign className="w-4 h-4 mr-2"/>Contabilizar anticipo {money(selected.advanceValue)}</Button></div>}
          </div>
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden"><div className="p-4 border-b flex items-center justify-between"><div className="font-bold flex items-center gap-2"><ClipboardList className="w-5 h-5"/>Actas y ejecución</div><span className="text-xs text-slate-500">{selectedActs.length} acta(s)</span></div>{selectedActs.length===0?<div className="p-10 text-center text-slate-500">No hay actas registradas.</div>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-3 text-left">Acta</th><th className="p-3 text-left">Fecha</th><th className="p-3 text-right">Ejecutado</th><th className="p-3 text-right">Retenciones</th><th className="p-3 text-right">Neto CxP</th><th className="p-3"></th></tr></thead><tbody className="divide-y">{selectedActs.map(a=><tr key={a.id}><td className="p-3"><div className="font-semibold">{a.number}</div><div className="text-[11px] text-slate-500">{actTypeLabel(a.type)}</div></td><td className="p-3">{a.date}</td><td className="p-3 text-right">{money(a.grossValue)}</td><td className="p-3 text-right text-red-600">{money(a.tax?.totalWithholdings)}</td><td className="p-3 text-right font-bold">{money(a.netPayable)}</td><td className="p-3 text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={()=>printAct(a)} title="Imprimir acta"><Printer className="w-4 h-4"/></Button>{Number(a.tax?.totalWithholdings||0)>0&&a.taxStatus!=='paid'&&<Button size="sm" variant="outline" onClick={()=>markTaxPaid(a.id)} title="Marcar retención declarada/pagada"><CheckCircle2 className="w-4 h-4 text-green-600"/></Button>}</div></td></tr>)}</tbody></table></div>}</div>
          <div className="grid xl:grid-cols-2 gap-4">
            <div className="bg-white border rounded-xl overflow-hidden">
              <div className="p-4 border-b flex items-center justify-between"><div className="font-bold flex items-center gap-2"><FilePlus2 className="w-5 h-5 text-indigo-600"/>Otrosíes y modificaciones</div><span className="text-xs text-slate-500">{(selected.amendments||[]).length}</span></div>
              {(selected.amendments||[]).length===0?<div className="p-5 text-sm text-slate-500">Sin modificaciones registradas.</div>:<div className="divide-y">{(selected.amendments||[]).map(a=><div key={a.id} className="p-3 text-sm"><div className="flex justify-between gap-3"><div><span className="font-semibold">{a.number} · {a.kind}</span><span className="ml-2 text-slate-500">{a.date}</span></div><Button size="sm" variant="ghost" onClick={()=>printAddendum(a)} title="Imprimir otrosí"><Printer className="w-4 h-4"/></Button></div><div className="text-slate-600 mt-1">{a.description}</div>{Number(a.amountChange)!==0&&<div className="font-medium mt-1">Variación: {money(a.amountChange)}</div>}{a.newEndDate&&<div className="text-xs text-slate-500">Nueva terminación: {a.newEndDate}</div>}</div>)}</div>}
            </div>
            <div className="bg-white border rounded-xl overflow-hidden">
              <div className="p-4 border-b flex items-center justify-between"><div className="font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-600"/>Garantías y pólizas</div><span className="text-xs text-slate-500">{(selected.guarantees||[]).length}</span></div>
              {(selected.guarantees||[]).length===0?<div className="p-5 text-sm text-slate-500">Sin pólizas registradas.</div>:<div className="divide-y">{(selected.guarantees||[]).map(g=>{const days=daysToDate(g.validTo);return <div key={g.id} className="p-3 text-sm"><div className="flex justify-between gap-3"><span className="font-semibold">{g.type} · {g.policyNumber}</span><span className={days!=null&&days<0?'text-red-600 font-bold':''}>{g.validTo}</span></div><div className="text-slate-600">{g.insurer||'Aseguradora no informada'} · {money(g.amount)}</div>{days!=null&&days<=30&&<div className={days<0?'text-red-600 text-xs font-bold':'text-amber-700 text-xs'}>{days<0?'Vencida hace '+Math.abs(days)+' día(s)':'Vence en '+days+' día(s)'}</div>}</div>})}</div>}
            </div>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3"><div><div className="font-bold flex items-center gap-2"><Flag className="w-5 h-5 text-slate-700"/>Checklist de cierre contractual</div><p className="text-xs text-slate-500 mt-1">La liquidación solo se habilita cuando no quedan pendientes financieros, tributarios ni contables.</p></div>{selected.status!=='Liquidado'&&<Button disabled={!canLiquidate} onClick={liquidateContract}><CheckCircle2 className="w-4 h-4 mr-2"/>Liquidar contrato</Button>}</div>
            <div className="grid md:grid-cols-2 gap-2">{closeoutChecks.map(item=><div key={item.key} className={"flex items-center gap-2 p-2 rounded-lg text-sm "+(item.ok?'bg-green-50 text-green-800':'bg-slate-50 text-slate-600')}><CheckCircle2 className={"w-4 h-4 "+(item.ok?'text-green-600':'text-slate-300')}/>{item.label}</div>)}</div>
            <div className="mt-4 pt-4 border-t"><div className="font-semibold text-sm flex items-center gap-2 mb-2"><History className="w-4 h-4"/>Historial de estado</div><div className="flex flex-wrap gap-2">{(selected.statusHistory||[]).map((h,i)=><span key={i} className="text-xs bg-slate-50 border rounded-full px-2 py-1">{h.status} · {String(h.date||'').slice(0,10)}{h.note?' · '+h.note:''}</span>)}</div></div>
          </div>
          <div className="grid md:grid-cols-3 gap-3"><div className="bg-white border rounded-xl p-4"><Building2 className="w-5 h-5 text-blue-600 mb-2"/><div className="text-xs text-slate-500">Ejecución contable</div><div className="font-bold">{selected.executionAccountCode}</div><div className="text-sm">{selected.executionAccountName}</div></div><div className="bg-white border rounded-xl p-4"><BadgeDollarSign className="w-5 h-5 text-emerald-600 mb-2"/><div className="text-xs text-slate-500">Retención renta</div><div className="font-bold">{getContractType(selected.type).taxConcept}</div><div className="text-sm">Cálculo por cada acta/pago.</div></div><div className="bg-white border rounded-xl p-4"><CalendarDays className="w-5 h-5 text-amber-600 mb-2"/><div className="text-xs text-slate-500">Plazo contractual vigente</div><div className="font-bold">{selected.startDate}</div><div className="text-sm">hasta {selectedEndDate||'por definir'}</div></div></div>
        </>}</div>
      </div>
    </div>
    <ContractModal open={contractOpen} onClose={()=>setContractOpen(false)} onSave={createContract} contacts={contacts||[]} accounts={accounts||[]}/>
    <ActModal open={actOpen} onClose={()=>setActOpen(false)} contract={selected} onSave={saveAct}/>
    <AddendumModal open={addendumOpen} onClose={()=>setAddendumOpen(false)} contract={selected} onSave={saveAddendum}/>
    <GuaranteeModal open={guaranteeOpen} onClose={()=>setGuaranteeOpen(false)} contract={selected} onSave={saveGuarantee}/>
  </>;
};
export default Contracts;
