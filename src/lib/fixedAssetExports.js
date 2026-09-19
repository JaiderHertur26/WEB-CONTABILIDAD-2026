import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { exportProfessionalWorkbook } from '@/lib/excel';

const money = (value) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);

const sanitize = (value) =>
  String(value || 'Entidad')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_');

const normalizePlace = (value) =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();

const isAccountingAdjustment = (asset) => {
  const category = normalizePlace(asset?.category);
  const name = normalizePlace(asset?.name);
  return category.includes('AJUSTE CONTABLE') || name.includes('DEPRECIACION HISTORICA ACUMULADA');
};

const placePriority = (asset) => {
  if (isAccountingAdjustment(asset)) return 4;
  const place = normalizePlace(asset?.location);
  if (place === 'TEMPLO') return 0;
  if (place === 'SACRISTIA') return 1;
  if (!place) return 3;
  return 2;
};

const displayPlace = (value) => {
  const normalized = normalizePlace(value);
  if (normalized === 'TEMPLO') return 'TEMPLO';
  if (normalized === 'SACRISTIA') return 'SACRISTÍA';
  if (!normalized) return 'SIN UBICACIÓN';
  return String(value || '').trim().toLocaleUpperCase('es-CO');
};

const sortAssetsByPlace = (assets = []) =>
  [...assets]
    .map((asset, originalIndex) => ({ asset, originalIndex }))
    .sort((a, b) => {
      const placeA = normalizePlace(a.asset?.location);
      const placeB = normalizePlace(b.asset?.location);
      const priorityA = placePriority(a.asset);
      const priorityB = placePriority(b.asset);

      if (priorityA !== priorityB) return priorityA - priorityB;

      if (priorityA === 2 && placeA !== placeB) {
        const placeCompare = placeA.localeCompare(placeB, 'es', { sensitivity: 'base' });
        if (placeCompare !== 0) return placeCompare;
      }

      const nameA = String(a.asset?.name || '').trim();
      const nameB = String(b.asset?.name || '').trim();
      const nameCompare = nameA.localeCompare(nameB, 'es', { sensitivity: 'base', numeric: true });
      if (nameCompare !== 0) return nameCompare;

      return a.originalIndex - b.originalIndex;
    })
    .map(({ asset }) => asset);

const assetSnapshot = (assets = []) => {
  let physicalSequence = 0;
  let adjustmentSequence = 0;

  const rows = sortAssetsByPlace(assets).map((asset) => {
    const originalValue = Math.max(0, Number(asset.value) || 0);
    const accumulated = Math.max(0, Number(asset.accumulatedDepreciation) || 0);
    const retired = String(asset.status || '').toLowerCase() === 'dado de baja';
    const accountingAdjustment = isAccountingAdjustment(asset);
    const savedNet = Number(asset.netBookValue);
    const calculatedNet = accountingAdjustment
      ? (originalValue - accumulated)
      : (Number.isFinite(savedNet) ? Math.max(0, savedNet) : Math.max(0, originalValue - accumulated));
    const netBookValue = retired ? 0 : calculatedNet;
    const sequence = accountingAdjustment
      ? `AJ-${String(++adjustmentSequence).padStart(2, '0')}`
      : ++physicalSequence;

    const adjustmentNote = 'Registro contable no físico; no representa una unidad inventariable.';
    const notes = accountingAdjustment
      ? [adjustmentNote, asset.notes].filter(Boolean).join(' ')
      : (asset.notes || '');

    return {
      No: sequence,
      Cantidad: accountingAdjustment ? null : (Number(asset.quantity) || 1),
      Activo: asset.name || 'Activo sin nombre',
      Identificacion: asset.model || '',
      Categoria: accountingAdjustment ? 'AJUSTE CONTABLE' : (asset.category || ''),
      Uso: accountingAdjustment ? '' : (asset.usage || ''),
      Estado: accountingAdjustment ? '' : (asset.status || ''),
      Lugar: accountingAdjustment ? 'AJUSTE CONTABLE' : displayPlace(asset.location),
      ValorOriginal: originalValue,
      Depreciacion: accumulated,
      ValorLibros: netBookValue,
      Observaciones: notes,
      Retirado: retired,
      EsAjusteContable: accountingAdjustment,
    };
  });
  const totals = rows.reduce((sum, row) => {
    sum.quantity += row.Cantidad;
    sum.original += row.ValorOriginal;
    sum.depreciation += row.Depreciacion;
    sum.net += row.ValorLibros;
    if (row.EsAjusteContable) sum.adjustments += 1;
    else if (row.Retirado) sum.retired += 1;
    else sum.active += 1;
    return sum;
  }, { quantity: 0, original: 0, depreciation: 0, net: 0, active: 0, retired: 0, adjustments: 0 });

  const categoryMap = new Map();
  rows.filter(row => !row.EsAjusteContable).forEach((row) => {
    const key = row.Categoria || 'Sin categoría';
    const current = categoryMap.get(key) || {
      Categoria: key, Activos: 0, Cantidad: 0, ValorOriginal: 0, Depreciacion: 0, ValorLibros: 0,
    };
    current.Activos += 1;
    current.Cantidad += row.Cantidad;
    current.ValorOriginal += row.ValorOriginal;
    current.Depreciacion += row.Depreciacion;
    current.ValorLibros += row.ValorLibros;
    categoryMap.set(key, current);
  });

  return {
    rows,
    totals,
    categories: [...categoryMap.values()],
    retiredRows: rows.filter(r => r.Retirado && !r.EsAjusteContable),
    adjustmentRows: rows.filter(r => r.EsAjusteContable),
  };
};

const companyMeta = (company, year) => ({
  name: company?.name || 'ENTIDAD CONTABLE',
  nit: company?.doc || '',
  address: company?.address || '',
  phone: company?.phone || '',
  year: String(year || new Date().getFullYear()),
  cutoff: new Date().toLocaleDateString('es-CO'),
});
export const exportFixedAssetsExcel = ({ assets, company, year }) => {
  const { rows, totals, categories, retiredRows, adjustmentRows } = assetSnapshot(assets);
  const meta = companyMeta(company, year);

  const inventoryRows = rows.map((row) => ({
    'N°': row.No,
    'Cant.': row.Cantidad,
    'Nombre del Activo': row.Activo,
    'Marca / Modelo / Serie': row.Identificacion,
    'Categoría': row.Categoria,
    'Uso': row.Uso,
    'Estado': row.Estado,
    'Lugar': row.Lugar,
    'Valor Original': row.ValorOriginal,
    'Depreciación Acumulada': row.Depreciacion,
    'Valor en Libros': row.ValorLibros,
    'Observaciones': row.Observaciones,
  }));

  const columns = [
    { key: 'N°', label: 'N°', width: 8, type: 'text' },
    { key: 'Cant.', label: 'CANT.', width: 9, type: 'integer' },
    { key: 'Nombre del Activo', label: 'NOMBRE DEL ACTIVO', width: 30, type: 'text' },
    { key: 'Marca / Modelo / Serie', label: 'MARCA / MODELO / SERIE', width: 28, type: 'text' },
    { key: 'Categoría', label: 'CATEGORÍA', width: 22, type: 'text' },
    { key: 'Uso', label: 'USO', width: 14, type: 'text' },
    { key: 'Estado', label: 'ESTADO', width: 17, type: 'text' },
    { key: 'Lugar', label: 'LUGAR A INVENTARIAR', width: 24, type: 'text' },
    { key: 'Valor Original', label: 'VALOR ORIGINAL', width: 18, type: 'currency' },
    { key: 'Depreciación Acumulada', label: 'DEPRECIACIÓN ACUM.', width: 19, type: 'currency' },
    { key: 'Valor en Libros', label: 'VALOR EN LIBROS', width: 18, type: 'currency' },
    { key: 'Observaciones', label: 'OBSERVACIONES', width: 34, type: 'text' },
  ];

  const summaryRows = [
    { Indicador: 'ACTIVOS VIGENTES', Valor: totals.active },
    { Indicador: 'AJUSTES CONTABLES', Valor: totals.adjustments },
    { Indicador: 'ACTIVOS DADOS DE BAJA', Valor: totals.retired },
    { Indicador: 'UNIDADES FÍSICAS INVENTARIADAS', Valor: totals.quantity },
    { Indicador: 'VALOR ORIGINAL REGISTRADO', ValorCOP: totals.original, __style: 'subtotal' },
    { Indicador: 'DEPRECIACIÓN ACUMULADA', ValorCOP: totals.depreciation, __style: 'subtotal' },
    { Indicador: 'VALOR TOTAL EN LIBROS', ValorCOP: totals.net, __style: 'total' },
  ];

  const sheets = [
    {
      name: 'Inventario',
      title: 'INVENTARIO DE ACTIVOS FIJOS',
      period: `VIGENCIA ${meta.year} · CORTE ${meta.cutoff}`,
      subtitle: [meta.address, meta.phone ? `Tel. ${meta.phone}` : ''].filter(Boolean).join(' · '),
      orientation: 'landscape',
      columns,
      rows: inventoryRows,
      summaryRows: [{
        'Nombre del Activo': 'TOTALES',
        'Cant.': totals.quantity,
        'Valor Original': totals.original,
        'Depreciación Acumulada': totals.depreciation,
        'Valor en Libros': totals.net,
        __style: 'total',
      }],
      notes: [
        'Valores expresados en pesos colombianos (COP).',
        'Orden del inventario: Templo, Sacristía, demás lugares alfabéticamente, Sin ubicación y ajustes contables al final.',
        'Los ajustes contables no se cuentan como unidades físicas y su efecto sí se incorpora al valor neto contable.',
        'Los activos dados de baja conservan su valor histórico para trazabilidad y se presentan con valor en libros igual a cero.',
        'Conservar este inventario junto con soportes de adquisición, depreciación, traslado y baja.',
      ],
    },
    {
      name: 'Resumen',
      title: 'RESUMEN DEL INVENTARIO DE ACTIVOS FIJOS',
      period: `VIGENCIA ${meta.year} · CORTE ${meta.cutoff}`,
      columns: [
        { key: 'Indicador', label: 'INDICADOR', width: 44, type: 'text' },
        { key: 'Valor', label: 'CANTIDAD', width: 18, type: 'integer' },
        { key: 'ValorCOP', label: 'VALOR (COP)', width: 22, type: 'currency' },
      ],
      rows: summaryRows,
    },
    {
      name: 'Por Categoría',
      title: 'ACTIVOS FIJOS POR CATEGORÍA',
      period: `VIGENCIA ${meta.year}`,
      columns: [
        { key: 'Categoria', label: 'CATEGORÍA', width: 36, type: 'text' },
        { key: 'Activos', label: 'REGISTROS', width: 14, type: 'integer' },
        { key: 'Cantidad', label: 'UNIDADES', width: 14, type: 'integer' },
        { key: 'ValorOriginal', label: 'VALOR ORIGINAL', width: 20, type: 'currency' },
        { key: 'Depreciacion', label: 'DEPRECIACIÓN', width: 20, type: 'currency' },
        { key: 'ValorLibros', label: 'VALOR EN LIBROS', width: 20, type: 'currency' },
      ],
      rows: categories,
      orientation: 'landscape',
    },
  ];
  if (retiredRows.length) {
    sheets.push({
      name: 'Bajas',
      title: 'ACTIVOS DADOS DE BAJA',
      period: `VIGENCIA ${meta.year}`,
      orientation: 'landscape',
      columns,
      rows: retiredRows.map((row) => ({
        'N°': row.No,
        'Cant.': row.Cantidad,
        'Nombre del Activo': row.Activo,
        'Marca / Modelo / Serie': row.Identificacion,
        'Categoría': row.Categoria,
        'Uso': row.Uso,
        'Estado': row.Estado,
        'Lugar': row.Lugar,
        'Valor Original': row.ValorOriginal,
        'Depreciación Acumulada': row.Depreciacion,
        'Valor en Libros': row.ValorLibros,
        'Observaciones': row.Observaciones,
      })),
      notes: ['Esta hoja conserva trazabilidad histórica de los activos marcados como dados de baja.'],
    });
  }

  exportProfessionalWorkbook({
    fileName: `Inventario_Activos_Fijos_${meta.year}`,
    companyName: meta.name,
    nit: meta.nit,
    title: 'INVENTARIO DE ACTIVOS FIJOS',
    period: `VIGENCIA ${meta.year}`,
    sheets,
  });
};
export const exportFixedAssetsPdf = ({ assets, company, year }) => {
  const { rows, totals } = assetSnapshot(assets);
  const meta = companyMeta(company, year);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setTextColor(31, 78, 121);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('ARQUIDIÓCESIS DE BARRANQUILLA', 14, 11);

  doc.setTextColor(25, 25, 25);
  doc.setFontSize(15);
  doc.text(meta.name.toUpperCase(), 14, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text([meta.nit ? `NIT: ${meta.nit}` : '', meta.address, meta.phone ? `Tel. ${meta.phone}` : ''].filter(Boolean).join(' · '), 14, 23);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('INVENTARIO DE ACTIVOS FIJOS', 283, 15, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Vigencia: ${meta.year} · Corte: ${meta.cutoff}`, 283, 21, { align: 'right' });

  doc.setDrawColor(31, 78, 121);
  doc.setLineWidth(0.5);
  doc.line(14, 27, 283, 27);

  doc.setFontSize(8);
  doc.text(`Activos vigentes: ${totals.active}   |   Ajustes contables: ${totals.adjustments}   |   Dados de baja: ${totals.retired}   |   Unidades físicas: ${totals.quantity}`, 14, 32);
  doc.text(`Valor original: ${money(totals.original)}   |   Depreciación acumulada: ${money(totals.depreciation)}   |   Valor en libros: ${money(totals.net)}`, 14, 37);
  autoTable(doc, {
    startY: 42,
    margin: { left: 8, right: 8 },
    theme: 'grid',
    head: [[
      'N°', 'Cant.', 'Activo', 'Marca / Modelo / Serie', 'Categoría',
      'Uso / Estado', 'Lugar', 'Valor Original', 'Deprec. Acum.', 'Valor Libros', 'Observaciones'
    ]],
    body: rows.map(row => [
      row.No,
      row.Cantidad,
      row.Activo,
      row.Identificacion,
      row.Categoria,
      [row.Uso, row.Estado].filter(Boolean).join(' / '),
      row.Lugar,
      money(row.ValorOriginal),
      money(row.Depreciacion),
      money(row.ValorLibros),
      row.Observaciones,
    ]),
    foot: [[
      '', totals.quantity, 'TOTALES', '', '', '', '',
      money(totals.original), money(totals.depreciation), money(totals.net), ''
    ]],
    styles: { font: 'helvetica', fontSize: 6.3, cellPadding: 1.3, valign: 'middle' },
    rowPageBreak: 'avoid',
    headStyles: { fillColor: [31, 78, 121], textColor: 255, fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [231, 238, 245], textColor: [20, 20, 20], fontStyle: 'bold' },
    showFoot: 'lastPage',
    columnStyles: {
      0: { cellWidth: 11, halign: 'center' },
      1: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 32 },
      3: { cellWidth: 28 },
      4: { cellWidth: 24 },
      5: { cellWidth: 22 },
      6: { cellWidth: 24 },
      7: { cellWidth: 22, halign: 'right' },
      8: { cellWidth: 22, halign: 'right' },
      9: { cellWidth: 22, halign: 'right' },
      10: { cellWidth: 36 },
    },
  });
  let y = (doc.lastAutoTable?.finalY || 45) + 8;
  let dedicatedClosingPage = false;
  if (y > 165) {
    doc.addPage();
    dedicatedClosingPage = true;
    y = 24;

    doc.setTextColor(31, 78, 121);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('ARQUIDIÓCESIS DE BARRANQUILLA', 14, 12);

    doc.setTextColor(25, 25, 25);
    doc.setFontSize(13);
    doc.text(meta.name.toUpperCase(), 14, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(meta.nit ? `NIT: ${meta.nit}` : '', 14, 25);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('CIERRE Y RESPONSABILIDAD DEL INVENTARIO', 283, 18, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Vigencia ${meta.year} · Corte ${meta.cutoff}`, 283, 24, { align: 'right' });

    doc.setDrawColor(31, 78, 121);
    doc.setLineWidth(0.5);
    doc.line(14, 30, 283, 30);
    y = 42;
  }

  doc.setTextColor(31, 78, 121);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(dedicatedClosingPage ? 11 : 8);
  doc.text('NOTAS DE CONTROL', 14, y);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(70, 70, 70);
  doc.setFontSize(8);
  doc.text('• Orden: Templo, Sacristía, demás lugares, Sin ubicación y Ajuste contable al final.', 14, y + 7);
  doc.text('• Los ajustes contables no son unidades físicas; su efecto se incorpora al valor neto.', 14, y + 13);
  doc.text('• Valores expresados en COP. Conservar soportes de adquisición, depreciación, traslado y baja.', 14, y + 19);

  if (dedicatedClosingPage) {
    doc.setDrawColor(210, 218, 226);
    doc.setFillColor(247, 249, 251);
    doc.roundedRect(14, y + 27, 269, 30, 2, 2, 'FD');

    doc.setTextColor(35, 35, 35);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Resumen de cierre', 19, y + 35);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Activos vigentes: ${totals.active}   |   Ajustes contables: ${totals.adjustments}   |   Unidades físicas: ${totals.quantity}`, 19, y + 42);
    doc.text(`Valor original: ${money(totals.original)}   |   Depreciación acumulada: ${money(totals.depreciation)}`, 19, y + 48);
    doc.text(`Valor en libros: ${money(totals.net)}`, 19, y + 54);
    y += 75;
  } else {
    y += 31;
  }

  doc.setTextColor(30, 30, 30);
  doc.setDrawColor(90, 90, 90);
  doc.line(25, y, 105, y);
  doc.line(185, y, 265, y);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Responsable del Inventario', 65, y + 6, { align: 'center' });
  doc.text('Párroco / Responsable', 225, y + 6, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Nombre, firma y fecha', 65, y + 11, { align: 'center' });
  doc.text('Nombre, firma y fecha', 225, y + 11, { align: 'center' });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(`Generado por Sistema Contable · ${meta.cutoff}`, 14, 204);
    doc.text(`Página ${page} de ${pageCount}`, 283, 204, { align: 'right' });
  }

  doc.save(`Inventario_Activos_Fijos_${sanitize(meta.name)}_${meta.year}.pdf`);
};
const wordCell = (text, { bold = false, align = AlignmentType.LEFT, fill, color, size = 14 } = {}) =>
  new TableCell({
    shading: fill ? { fill } : undefined,
    children: [
      new Paragraph({
        alignment: align,
        children: [new TextRun({ text: String(text ?? ''), bold, size, color })],
      }),
    ],
  });

export const exportFixedAssetsWord = async ({ assets, company, year }) => {
  const { rows, totals } = assetSnapshot(assets);
  const meta = companyMeta(company, year);

  const noBorders = {
    top: { style: BorderStyle.NONE },
    bottom: { style: BorderStyle.NONE },
    left: { style: BorderStyle.NONE },
    right: { style: BorderStyle.NONE },
    insideHorizontal: { style: BorderStyle.NONE },
    insideVertical: { style: BorderStyle.NONE },
  };

  const infoTable = new Table({
    borders: noBorders,
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        wordCell(meta.name, { bold: true, size: 18 }),
        wordCell(meta.nit ? `NIT: ${meta.nit}` : '', { bold: true, align: AlignmentType.RIGHT, size: 16 }),
      ]}),
      new TableRow({ children: [
        wordCell(meta.address, { size: 14 }),
        wordCell(meta.phone ? `Tel. ${meta.phone}` : '', { align: AlignmentType.RIGHT, size: 14 }),
      ]}),
    ],
  });
  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        wordCell('Activos vigentes', { bold: true, fill: 'D9EAF7' }),
        wordCell(totals.active, { align: AlignmentType.CENTER }),
        wordCell('Ajustes contables', { bold: true, fill: 'D9EAF7' }),
        wordCell(totals.adjustments, { align: AlignmentType.CENTER }),
        wordCell('Dados de baja', { bold: true, fill: 'D9EAF7' }),
        wordCell(totals.retired, { align: AlignmentType.CENTER }),
      ]}),
      new TableRow({ children: [
        wordCell('Unidades físicas', { bold: true, fill: 'EEF5FB' }),
        wordCell(totals.quantity, { align: AlignmentType.CENTER }),
        wordCell('', { fill: 'EEF5FB' }),
        wordCell('', { fill: 'EEF5FB' }),
        wordCell('', { fill: 'EEF5FB' }),
        wordCell('', { fill: 'EEF5FB' }),
      ]}),
      new TableRow({ children: [
        wordCell('Valor original', { bold: true, fill: 'EEF5FB' }),
        wordCell(money(totals.original), { align: AlignmentType.RIGHT }),
        wordCell('Depreciación acumulada', { bold: true, fill: 'EEF5FB' }),
        wordCell(money(totals.depreciation), { align: AlignmentType.RIGHT }),
        wordCell('Valor en libros', { bold: true, fill: 'EEF5FB' }),
        wordCell(money(totals.net), { bold: true, align: AlignmentType.RIGHT }),
      ]}),
    ],
  });

  const headerFill = '1F4E78';
  const tableRows = [
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        'N°', 'Cant.', 'Activo', 'Marca / Modelo / Serie', 'Categoría', 'Uso / Estado',
        'Lugar', 'Valor Original', 'Deprec. Acum.', 'Valor en Libros', 'Observaciones'
      ].map(label => wordCell(label, { bold: true, align: AlignmentType.CENTER, fill: headerFill, color: 'FFFFFF', size: 12 })),
    }),
  ];
  rows.forEach((row) => {
    tableRows.push(new TableRow({
      cantSplit: true,
      children: [
        wordCell(row.No, { align: AlignmentType.CENTER, size: 12 }),
        wordCell(row.Cantidad, { align: AlignmentType.CENTER, size: 12 }),
        wordCell(row.Activo, { size: 12 }),
        wordCell(row.Identificacion, { size: 12 }),
        wordCell(row.Categoria, { size: 12 }),
        wordCell([row.Uso, row.Estado].filter(Boolean).join(' / '), { align: AlignmentType.CENTER, size: 12 }),
        wordCell(row.Lugar, { size: 12 }),
        wordCell(money(row.ValorOriginal), { align: AlignmentType.RIGHT, size: 12 }),
        wordCell(money(row.Depreciacion), { align: AlignmentType.RIGHT, size: 12 }),
        wordCell(money(row.ValorLibros), { align: AlignmentType.RIGHT, size: 12 }),
        wordCell(row.Observaciones, { size: 12 }),
      ],
    }));
  });

  tableRows.push(new TableRow({
    cantSplit: true,
    children: [
      wordCell('', { fill: 'E7E6E6' }),
      wordCell(totals.quantity, { bold: true, align: AlignmentType.CENTER, fill: 'E7E6E6' }),
      wordCell('TOTALES', { bold: true, fill: 'E7E6E6' }),
      wordCell('', { fill: 'E7E6E6' }),
      wordCell('', { fill: 'E7E6E6' }),
      wordCell('', { fill: 'E7E6E6' }),
      wordCell('', { fill: 'E7E6E6' }),
      wordCell(money(totals.original), { bold: true, align: AlignmentType.RIGHT, fill: 'E7E6E6' }),
      wordCell(money(totals.depreciation), { bold: true, align: AlignmentType.RIGHT, fill: 'E7E6E6' }),
      wordCell(money(totals.net), { bold: true, align: AlignmentType.RIGHT, fill: 'E7E6E6' }),
      wordCell('', { fill: 'E7E6E6' }),
    ],
  }));
  const inventoryTable = new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });

  const signatureTable = new Table({
    borders: noBorders,
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        wordCell('________________________________________', { align: AlignmentType.CENTER }),
        wordCell('________________________________________', { align: AlignmentType.CENTER }),
      ]}),
      new TableRow({ children: [
        wordCell('Responsable del Inventario', { bold: true, align: AlignmentType.CENTER }),
        wordCell('Párroco / Responsable', { bold: true, align: AlignmentType.CENTER }),
      ]}),
      new TableRow({ children: [
        wordCell('Nombre, firma y fecha', { align: AlignmentType.CENTER, size: 12 }),
        wordCell('Nombre, firma y fecha', { align: AlignmentType.CENTER, size: 12 }),
      ]}),
    ],
  });

  const closingSummaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        wordCell('Activos vigentes', { bold: true, fill: 'D9EAF7' }),
        wordCell(totals.active, { align: AlignmentType.CENTER }),
        wordCell('Ajustes contables', { bold: true, fill: 'D9EAF7' }),
        wordCell(totals.adjustments, { align: AlignmentType.CENTER }),
        wordCell('Unidades físicas', { bold: true, fill: 'D9EAF7' }),
        wordCell(totals.quantity, { align: AlignmentType.CENTER }),
      ]}),
      new TableRow({ children: [
        wordCell('Valor original', { bold: true, fill: 'EEF5FB' }),
        wordCell(money(totals.original), { align: AlignmentType.RIGHT }),
        wordCell('Depreciación acumulada', { bold: true, fill: 'EEF5FB' }),
        wordCell(money(totals.depreciation), { align: AlignmentType.RIGHT }),
        wordCell('Valor en libros', { bold: true, fill: 'EEF5FB' }),
        wordCell(money(totals.net), { bold: true, align: AlignmentType.RIGHT }),
      ]}),
    ],
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 360, right: 360, bottom: 520, left: 360, footer: 240 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  size: 12,
                  color: '777777',
                  children: [
                    `Generado por Sistema Contable · ${meta.cutoff} · Página `,
                    PageNumber.CURRENT,
                    ' de ',
                    PageNumber.TOTAL_PAGES,
                  ],
                }),
              ],
            }),
          ],
        }),
      },
      children: [
        new Paragraph({
          children: [new TextRun({ text: 'ARQUIDIÓCESIS DE BARRANQUILLA', bold: true, size: 20, color: '1F4E78' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 180 },
          children: [new TextRun({ text: 'INVENTARIO DE ACTIVOS FIJOS', bold: true, size: 30, color: '17365D' })],
        }),
        infoTable,
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 100, after: 160 },
          children: [new TextRun({ text: `VIGENCIA ${meta.year} · CORTE ${meta.cutoff}`, bold: true, size: 18 })],
        }),
        summaryTable,
        new Paragraph({ text: '', spacing: { after: 120 } }),
        inventoryTable,
        new Paragraph({
          pageBreakBefore: true,
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new TextRun({ text: 'CIERRE Y RESPONSABILIDAD DEL INVENTARIO', bold: true, size: 28, color: '17365D' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 160 },
          children: [new TextRun({ text: `${meta.name.toUpperCase()} · NIT: ${meta.nit || '-'} · VIGENCIA ${meta.year} · CORTE ${meta.cutoff}`, bold: true, size: 16 })],
        }),
        closingSummaryTable,
        new Paragraph({
          spacing: { before: 220, after: 80 },
          children: [new TextRun({ text: 'NOTAS DE CONTROL', bold: true, size: 18, color: '1F4E78' })],
        }),
        new Paragraph({
          spacing: { after: 50 },
          children: [new TextRun({
            text: '• Orden del inventario: Templo, Sacristía, demás lugares alfabéticamente, activos sin ubicación y ajustes contables al final.',
            size: 14,
          })],
        }),
        new Paragraph({
          spacing: { after: 50 },
          children: [new TextRun({
            text: '• Los ajustes contables no se cuentan como unidades físicas y su efecto sí se incorpora al valor neto contable.',
            size: 14,
          })],
        }),
        new Paragraph({
          spacing: { after: 50 },
          children: [new TextRun({
            text: '• Valores expresados en pesos colombianos (COP).',
            size: 14,
          })],
        }),
        new Paragraph({
          spacing: { after: 520 },
          children: [new TextRun({
            text: '• Conservar este inventario junto con los soportes de adquisición, depreciación, traslado y baja.',
            size: 14,
          })],
        }),
        signatureTable,
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Inventario_Activos_Fijos_${sanitize(meta.name)}_${meta.year}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};
