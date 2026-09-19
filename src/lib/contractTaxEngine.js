export const UVT_2026 = 52374;
export const TAX_RULE_VERSION = 'CO-2026-05-08-PRE-D572';

export const CONTRACT_TYPES = [
  { key: 'construction', label: 'Construcción / Obra civil', taxConcept: 'construction', retentionDeclarant: 2, retentionNonDeclarant: 2, minUVT: 27, vatMode: 'construction-profit', accountPrefix: '1508', accountName: 'CONSTRUCCIONES EN CURSO', capitalizable: true },
  { key: 'maintenance', label: 'Mantenimiento y reparación', taxConcept: 'services', retentionDeclarant: 4, retentionNonDeclarant: 6, minUVT: 4, vatMode: 'full', accountPrefix: '51', accountName: 'MANTENIMIENTO Y REPARACIONES' },
  { key: 'professional', label: 'Servicios profesionales / Honorarios', taxConcept: 'honorarios', retentionDeclarant: 11, retentionNonDeclarant: 10, minUVT: 0, vatMode: 'full', accountPrefix: '5110', accountName: 'HONORARIOS' },
  { key: 'consulting', label: 'Consultoría / Interventoría', taxConcept: 'honorarios', retentionDeclarant: 11, retentionNonDeclarant: 10, minUVT: 0, vatMode: 'full', accountPrefix: '5110', accountName: 'HONORARIOS' },
  { key: 'supply', label: 'Suministro / Compra de bienes', taxConcept: 'purchases', retentionDeclarant: 2.5, retentionNonDeclarant: 3.5, minUVT: 27, vatMode: 'full', accountPrefix: '14', accountName: 'INVENTARIOS / SUMINISTROS' },
  { key: 'lease', label: 'Arrendamiento de inmueble', taxConcept: 'lease', retentionDeclarant: 3.5, retentionNonDeclarant: 3.5, minUVT: 0, vatMode: 'manual', accountPrefix: '5120', accountName: 'ARRENDAMIENTOS' },
  { key: 'cleaning_security', label: 'Aseo / Vigilancia', taxConcept: 'cleaning-security', retentionDeclarant: 2, retentionNonDeclarant: 2, minUVT: 4, vatMode: 'aiu', accountPrefix: '5135', accountName: 'SERVICIOS' },
  { key: 'technology', label: 'Tecnología / Soporte', taxConcept: 'services', retentionDeclarant: 4, retentionNonDeclarant: 6, minUVT: 4, vatMode: 'full', accountPrefix: '51', accountName: 'SERVICIOS' },
  { key: 'transport', label: 'Transporte / Logística', taxConcept: 'services', retentionDeclarant: 4, retentionNonDeclarant: 6, minUVT: 4, vatMode: 'manual', accountPrefix: '5135', accountName: 'SERVICIOS' },
  { key: 'other', label: 'Otro contrato', taxConcept: 'other', retentionDeclarant: 2.5, retentionNonDeclarant: 3.5, minUVT: 27, vatMode: 'manual', accountPrefix: '5', accountName: 'GASTOS' },
];export const getContractType = (key) =>
  CONTRACT_TYPES.find(item => item.key === key) || CONTRACT_TYPES[CONTRACT_TYPES.length - 1];

const money = value => Math.max(0, Number(value) || 0);
const pct = value => Math.max(0, Number(value) || 0);

export const resolveRetentionRate = (typeKey, contractor = {}, overrideRate = '') => {
  if (overrideRate !== '' && overrideRate != null) return pct(overrideRate);
  const rule = getContractType(typeKey);

  if (rule.taxConcept === 'honorarios') {
    if (contractor.type === 'company') return 11;
    if (contractor.forceHonorarios11) return 11;
    return contractor.declarant === false ? 10 : 10;
  }

  return contractor.declarant === false
    ? rule.retentionNonDeclarant
    : rule.retentionDeclarant;
};

export const calculateContractTaxes = ({
  typeKey,
  baseAmount,
  contractor = {},
  tax = {},
}) => {
  const rule = getContractType(typeKey);
  const base = money(baseAmount);
  const retentionRate = resolveRetentionRate(typeKey, contractor, tax.retentionRate);
  const threshold = (Number(tax.minUVT ?? rule.minUVT) || 0) * UVT_2026;
  const withholdingApplies = tax.isWithholdingAgent !== false &&
    contractor.exemptFromWithholding !== true &&
    base >= threshold;  const incomeWithholding = withholdingApplies
    ? Math.round(base * retentionRate / 100)
    : 0;

  const ivaRate = tax.appliesVAT === false ? 0 : pct(tax.vatRate ?? 19);
  let ivaBase = 0;
  if (ivaRate > 0) {
    if (rule.vatMode === 'construction-profit') {
      ivaBase = money(tax.constructionProfitBase);
    } else if (rule.vatMode === 'aiu') {
      ivaBase = Math.round(base * pct(tax.aiuPercent ?? 10) / 100);
    } else if (rule.vatMode === 'manual') {
      ivaBase = money(tax.manualVatBase ?? base);
    } else {
      ivaBase = base;
    }
  }

  const vat = Math.round(ivaBase * ivaRate / 100);
  const reteIvaRate = pct(tax.reteIvaRate);
  const reteIva = tax.appliesReteIVA && vat > 0
    ? Math.round(vat * reteIvaRate / 100)
    : 0;

  const reteIcaPerThousand = pct(tax.reteIcaPerThousand);
  const reteIca = tax.appliesReteICA
    ? Math.round(base * reteIcaPerThousand / 1000)
    : 0;

  const invoiceTotal = base + vat;
  const totalWithholdings = incomeWithholding + reteIva + reteIca;
  return {
    rule,
    base,
    threshold,
    retentionRate,
    withholdingApplies,
    incomeWithholding,    ivaRate,
    ivaBase,
    vat,
    reteIvaRate,
    reteIva,
    reteIcaPerThousand,
    reteIca,
    invoiceTotal,
    totalWithholdings,
    netBeforeAdvance: Math.max(0, invoiceTotal - totalWithholdings),
    legalNote: rule.vatMode === 'construction-profit'
      ? 'En construcción de bien inmueble el IVA se calcula sobre honorarios del constructor o, si no se pactan, sobre la utilidad configurada.'
      : 'La aplicación de IVA y retenciones depende de las responsabilidades tributarias del tercero y del hecho económico.',
  };
};

const RETENTION_DUE_DATES = {
  '2026-01': ['2026-02-10','2026-02-11','2026-02-12','2026-02-13','2026-02-16','2026-02-17','2026-02-18','2026-02-19','2026-02-20','2026-02-23'],
  '2026-02': ['2026-03-10','2026-03-11','2026-03-12','2026-03-13','2026-03-16','2026-03-17','2026-03-18','2026-03-19','2026-03-20','2026-03-24'],
  '2026-03': ['2026-04-13','2026-04-14','2026-04-15','2026-04-16','2026-04-17','2026-04-20','2026-04-21','2026-04-22','2026-04-23','2026-04-24'],
  '2026-04': ['2026-05-12','2026-05-13','2026-05-14','2026-05-15','2026-05-19','2026-05-20','2026-05-21','2026-05-22','2026-05-25','2026-05-26'],
  '2026-05': ['2026-06-10','2026-06-11','2026-06-12','2026-06-16','2026-06-17','2026-06-18','2026-06-19','2026-06-22','2026-06-23','2026-06-24'],
  '2026-06': ['2026-07-09','2026-07-10','2026-07-14','2026-07-15','2026-07-16','2026-07-17','2026-07-21','2026-07-22','2026-07-23','2026-07-24'],
};Object.assign(RETENTION_DUE_DATES, {
  '2026-07': ['2026-08-12','2026-08-13','2026-08-14','2026-08-18','2026-08-19','2026-08-20','2026-08-21','2026-08-24','2026-08-25','2026-08-26'],
  '2026-08': ['2026-09-09','2026-09-10','2026-09-11','2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18','2026-09-21','2026-09-22'],
  '2026-09': ['2026-10-09','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23'],
  '2026-10': ['2026-11-11','2026-11-12','2026-11-13','2026-11-17','2026-11-18','2026-11-19','2026-11-20','2026-11-23','2026-11-24','2026-11-25'],
  '2026-11': ['2026-12-10','2026-12-11','2026-12-14','2026-12-15','2026-12-16','2026-12-17','2026-12-18','2026-12-21','2026-12-22','2026-12-23'],
  '2026-12': ['2027-01-13','2027-01-14','2027-01-15','2027-01-18','2027-01-19','2027-01-20','2027-01-21','2027-01-22','2027-01-25','2027-01-26'],
});

const cleanNit = nit => String(nit || '').replace(/\D/g, '');

export const getRetentionDueDate = (paymentDate, nit) => {
  const period = String(paymentDate || '').slice(0, 7);
  const schedule = RETENTION_DUE_DATES[period];
  if (!schedule) return null;
  const digits = cleanNit(nit);
  if (!digits) return null;
  const last = Number(digits.slice(-1));
  const index = last === 0 ? 9 : last - 1;
  return schedule[index] || null;
};

export const getRetentionAlert = (paymentDate, nit, today = new Date()) => {
  const dueDate = getRetentionDueDate(paymentDate, nit);
  if (!dueDate) return { dueDate: null, days: null, status: 'unknown' };
  const [y,m,d] = dueDate.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.ceil((due - start) / 86400000);
  return {
    dueDate,
    days,
    status: days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 5 ? 'soon' : 'pending',
  };
};