import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
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

const placePriority = (value) => {
  const place = normalizePlace(value);
  if (place === 'TEMPLO') return 0;
  if (place === 'SACRISTIA') return 1;
  if (!place) return 3;
  return 2;
};

const sortAssetsByPlace = (assets = []) =>
  [...assets]
    .map((asset, originalIndex) => ({ asset, originalIndex }))
    .sort((a, b) => {
      const placeA = normalizePlace(a.asset?.location);
      const placeB = normalizePlace(b.asset?.location);
      const priorityA = placePriority(placeA);
      const priorityB = placePriority(placeB);

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
  const rows = sortAssetsByPlace(assets).map((asset, index) => {
    const originalValue = Math.max(0, Number(asset.value) || 0);
    const accumulated = Math.max(0, Number(asset.accumulatedDepreciation) || 0);
    const retired = String(asset.status || '').toLowerCase() === 'dado de baja';
    const savedNet = Number(asset.netBookValue);
    const calculatedNet = Number.isFinite(savedNet)
      ? Math.max(0, savedNet)
      : Math.max(0, originalValue - accumulated);
    const netBookValue = retired ? 0 : calculatedNet;

    return {
      No: index + 1,
      Cantidad: Number(asset.quantity) || 1,
      Activo: asset.name || 'Activo sin nombre',
      Identificacion: asset.model || '',
      Categoria: asset.category || '',
      Uso: asset.usage || '',
      Estado: asset.status || '',
      Lugar: asset.location || '',
      ValorOriginal: originalValue,
      Depreciacion: accumulated,
      ValorLibros: netBookValue,
      Observaciones: asset.notes || '',
      Retirado: retired,
    };
  });
  const totals = rows.reduce((sum, row) => {
    sum.quantity += row.Cantidad;
    sum.original += row.ValorOriginal;
    sum.depreciation += row.Depreciacion;
    sum.net += row.ValorLibros;
    if (row.Retirado) sum.retired += 1;
    else sum.active += 1;
    return sum;
  }, { quantity: 0, original: 0, depreciation: 0, net: 0, active: 0, retired: 0 });

  const categoryMap = new Map();
  rows.forEach((row) => {
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

  return { rows, totals, categories: [...categoryMap.values()], retiredRows: rows.filter(r => r.Retirado) };
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
  const { rows, totals, categories, retiredRows } = assetSnapshot(assets);
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
    { key: 'N°', label: 'N°', width: 7, type: 'integer' },
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
    { Indicador: 'ACTIVOS DADOS DE BAJA', Valor: totals.retired },
    { Indicador: 'UNIDADES INVENTARIADAS', Valor: totals.quantity },
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
  doc.text(`Activos vigentes: ${totals.active}   |   Dados de baja: ${totals.retired}   |   Unidades: ${totals.quantity}`, 14, 32);
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
    headStyles: { fillColor: [31, 78, 121], textColor: 255, fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [231, 238, 245], textColor: [20, 20, 20], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
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
  if (y > 175) {
    doc.addPage();
    y = 25;
  }

  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text('Notas de control:', 14, y);
  doc.text('• Valores expresados en COP. Los activos dados de baja conservan trazabilidad histórica y valor en libros $0.', 14, y + 5);
  doc.text('• Conservar con soportes de adquisición, depreciación, traslado y baja.', 14, y + 10);

  y += 26;
  doc.setTextColor(30, 30, 30);
  doc.line(25, y, 105, y);
  doc.line(185, y, 265, y);
  doc.setFontSize(8);
  doc.text('Responsable del Inventario', 65, y + 5, { align: 'center' });
  doc.text('Párroco / Responsable', 225, y + 5, { align: 'center' });

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
        wordCell('Dados de baja', { bold: true, fill: 'D9EAF7' }),
        wordCell(totals.retired, { align: AlignmentType.CENTER }),
        wordCell('Unidades', { bold: true, fill: 'D9EAF7' }),
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

  const headerFill = '1F4E78';
  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        'Cant.', 'Activo', 'Marca / Modelo / Serie', 'Categoría', 'Uso / Estado',
        'Lugar', 'Valor Original', 'Deprec. Acum.', 'Valor en Libros', 'Observaciones'
      ].map(label => wordCell(label, { bold: true, align: AlignmentType.CENTER, fill: headerFill, color: 'FFFFFF', size: 12 })),
    }),
  ];
  rows.forEach((row) => {
    tableRows.push(new TableRow({
      children: [
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
    children: [
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
    ],
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 360, right: 360, bottom: 360, left: 360 },
        },
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
          spacing: { before: 180, after: 80 },
          children: [new TextRun({ text: 'NOTAS DE CONTROL', bold: true, size: 16, color: '1F4E78' })],
        }),
        new Paragraph({
          children: [new TextRun({
            text: 'Valores expresados en pesos colombianos (COP). Los activos dados de baja conservan su valor histórico para trazabilidad y se presentan con valor en libros igual a cero.',
            size: 14,
          })],
        }),
        new Paragraph({
          spacing: { after: 420 },
          children: [new TextRun({
            text: 'Conservar este inventario junto con los soportes de adquisición, depreciación, traslado y baja.',
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
