import XLSXStyle from 'xlsx-js-style';

const XLSX = XLSXStyle?.default || XLSXStyle;

const COLORS = {
  navy: '1F4E78',
  navyDark: '17365D',
  blueLight: 'D9EAF7',
  bluePale: 'EEF5FB',
  gray: 'E7E6E6',
  grayLight: 'F7F7F7',
  grayText: '595959',
  white: 'FFFFFF',
  black: '1F1F1F',
  green: 'E2F0D9',
  greenText: '375623',
  redText: '9C0006',
  border: 'B8C2CC',
};

const CURRENCY_FORMAT = '$ #,##0.00;[Red]($ #,##0.00)';
const NUMBER_FORMAT = '#,##0.00;[Red](#,##0.00)';
const INTEGER_FORMAT = '#,##0';
const DATE_FORMAT = 'dd/mm/yyyy';

const thinBorder = {
  top: { style: 'thin', color: { rgb: COLORS.border } },
  bottom: { style: 'thin', color: { rgb: COLORS.border } },
  left: { style: 'thin', color: { rgb: COLORS.border } },
  right: { style: 'thin', color: { rgb: COLORS.border } },
};
const sanitizeSheetName = (name) =>
  String(name || 'Reporte')
    .replace(/[\\/?*\[\]:]/g, ' ')
    .trim()
    .slice(0, 31) || 'Reporte';

const sanitizeFileName = (name) =>
  String(name || 'Reporte_Contable')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

const normalizeNit = (nit) => {
  const value = String(nit || '').trim();
  if (!value) return '';
  return /^NIT\s*:/i.test(value) ? value : `NIT: ${value}`;
};

const generatedText = () =>
  new Date().toLocaleString('es-CO', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

const getCell = (ws, r, c) => {
  const ref = XLSX.utils.encode_cell({ r, c });
  if (!ws[ref]) ws[ref] = { t: 's', v: '' };
  return ws[ref];
};

const getExistingCell = (ws, r, c) => {
  const ref = XLSX.utils.encode_cell({ r, c });
  return ws[ref] || null;
};

const cleanMatrixValue = (value) =>
  value === '' || value === undefined || value === null ? null : value;
const baseCellStyle = {
  font: { name: 'Aptos', sz: 10, color: { rgb: COLORS.black } },
  alignment: { vertical: 'center' },
  border: thinBorder,
};

const currencyColumn = (column) =>
  ['currency', 'money', 'cop'].includes(String(column?.type || '').toLowerCase());

const numericColumn = (column) =>
  ['number', 'integer', 'currency', 'money', 'cop'].includes(String(column?.type || '').toLowerCase());

const styleDataCell = (cell, column, rowStyle) => {
  const style = {
    ...baseCellStyle,
    alignment: {
      vertical: 'center',
      horizontal: column?.align || (numericColumn(column) ? 'right' : 'left'),
      wrapText: true,
    },
  };

  if (currencyColumn(column)) style.numFmt = CURRENCY_FORMAT;
  else if (column?.type === 'number') style.numFmt = NUMBER_FORMAT;
  else if (column?.type === 'integer') style.numFmt = INTEGER_FORMAT;
  else if (column?.type === 'date') style.numFmt = DATE_FORMAT;
  else if (column?.type === 'text') style.numFmt = '@';

  if (rowStyle === 'section') {
    style.fill = { fgColor: { rgb: COLORS.blueLight } };
    style.font = { ...style.font, bold: true, color: { rgb: COLORS.navyDark } };
  }
  if (rowStyle === 'subtotal') {
    style.fill = { fgColor: { rgb: COLORS.grayLight } };
    style.font = { ...style.font, bold: true };
    style.border = {
      ...thinBorder,
      top: { style: 'thin', color: { rgb: COLORS.navy } },
    };
  }

  if (rowStyle === 'total') {
    style.fill = { fgColor: { rgb: COLORS.navy } };
    style.font = { ...style.font, bold: true, color: { rgb: COLORS.white } };
    style.border = {
      ...thinBorder,
      top: { style: 'medium', color: { rgb: COLORS.navyDark } },
      bottom: { style: 'double', color: { rgb: COLORS.navyDark } },
    };
  }

  if (rowStyle === 'success') {
    style.fill = { fgColor: { rgb: COLORS.green } };
    style.font = { ...style.font, bold: true, color: { rgb: COLORS.greenText } };
  }

  if (rowStyle === 'note') {
    style.fill = { fgColor: { rgb: COLORS.bluePale } };
    style.font = { ...style.font, italic: true, color: { rgb: COLORS.grayText } };
  }

  cell.s = style;
};
const styleMetadata = (ws, colCount, metaRowCount) => {
  const lastCol = Math.max(0, colCount - 1);

  for (let r = 0; r < metaRowCount; r += 1) {
    const cell = getExistingCell(ws, r, 0);
    if (cell) {
      cell.s = {
        font: { name: 'Aptos Display', sz: 10, color: { rgb: COLORS.grayText } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      };
    }
    ws['!merges'].push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  }

  const institutionCell = getExistingCell(ws, 0, 0);
  if (institutionCell) institutionCell.s.font = {
    name: 'Aptos Display', sz: 11, bold: true, color: { rgb: COLORS.navyDark },
  };

  const companyCell = getExistingCell(ws, 1, 0);
  if (companyCell) companyCell.s.font = {
    name: 'Aptos Display', sz: 15, bold: true, color: { rgb: COLORS.black },
  };

  const nitCell = getExistingCell(ws, 2, 0);
  if (nitCell) nitCell.s.font = {
    name: 'Aptos', sz: 10, bold: true, color: { rgb: COLORS.grayText },
  };

  const titleCell = getExistingCell(ws, 3, 0);
  if (titleCell) titleCell.s = {
    fill: { fgColor: { rgb: COLORS.navy } },
    font: { name: 'Aptos Display', sz: 14, bold: true, color: { rgb: COLORS.white } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  };

  const periodCell = getExistingCell(ws, 4, 0);
  if (periodCell) periodCell.s.font = {
    name: 'Aptos', sz: 10, bold: true, color: { rgb: COLORS.navyDark },
  };
};
const buildProfessionalSheet = ({
  institution = 'ARQUIDIÓCESIS DE BARRANQUILLA',
  companyName = '',
  nit = '',
  title = 'REPORTE CONTABLE',
  period = '',
  subtitle = '',
  columns = [],
  rows = [],
  summaryRows = [],
  notes = [],
  orientation = 'portrait',
  freezeHeader = true,
  autoFilter = true,
  showCurrency = true,
}) => {
  const safeColumns = columns.length
    ? columns
    : [{ key: 'Concepto', label: 'Concepto', width: 42 }];

  const metadata = [
    [institution],
    [companyName || 'ENTIDAD CONTABLE'],
    [cleanMatrixValue(normalizeNit(nit))],
    [title],
    [cleanMatrixValue(period)],
    [subtitle || (showCurrency ? `Generado: ${generatedText()} | Moneda: COP` : `Generado: ${generatedText()}`)],
    [],
  ];

  const header = safeColumns.map((c) => c.label || c.key);
  const dataMatrix = rows.map((row) =>
    safeColumns.map((column) => cleanMatrixValue(row?.[column.key]))
  );
  const summaryMatrix = summaryRows.length
    ? [
        [],
        ...summaryRows.map((row) =>
          safeColumns.map((column) => cleanMatrixValue(row?.[column.key]))
        ),
      ]
    : [];

  const noteMatrix = notes.length
    ? [
        [],
        ['NOTAS DE CONTROL'],
        ...notes.map((note) => [String(note)]),
      ]
    : [];

  const aoa = [...metadata, header, ...dataMatrix, ...summaryMatrix, ...noteMatrix];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = ws['!merges'] || [];

  const metaRowCount = metadata.length - 1;
  const headerRow = metadata.length;
  const firstDataRow = headerRow + 1;
  const lastDataRow = firstDataRow + Math.max(0, rows.length - 1);
  const colCount = safeColumns.length;

  styleMetadata(ws, colCount, metaRowCount);

  for (let c = 0; c < colCount; c += 1) {
    const cell = getCell(ws, headerRow, c);
    cell.s = {
      fill: { fgColor: { rgb: COLORS.navyDark } },
      font: { name: 'Aptos', sz: 10, bold: true, color: { rgb: COLORS.white } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: thinBorder,
    };
  }
  rows.forEach((row, index) => {
    const excelRow = firstDataRow + index;
    const rowStyle =
      row?.__style ||
      (row?.isTotal ? 'total' : row?.isSubtotal ? 'subtotal' : row?.isBold ? 'section' : '');

    safeColumns.forEach((column, c) => {
      const cell = getExistingCell(ws, excelRow, c);
      if (!cell) return;
      styleDataCell(cell, column, rowStyle);
    });
  });

  if (summaryRows.length) {
    const summaryStart = lastDataRow + 2;
    summaryRows.forEach((row, index) => {
      const excelRow = summaryStart + index;
      const rowStyle = row?.__style || 'total';
      safeColumns.forEach((column, c) => {
        const cell = getExistingCell(ws, excelRow, c);
        if (!cell) return;
        styleDataCell(cell, column, rowStyle);
      });
    });
  }

  if (notes.length) {
    const noteTitleRow =
      headerRow + rows.length + (summaryRows.length ? summaryRows.length + 2 : 1) + 1;

    const titleCell = getCell(ws, noteTitleRow, 0);
    titleCell.s = {
      fill: { fgColor: { rgb: COLORS.blueLight } },
      font: { name: 'Aptos', sz: 10, bold: true, color: { rgb: COLORS.navyDark } },
      alignment: { horizontal: 'left', vertical: 'center' },
    };
    ws['!merges'].push({ s: { r: noteTitleRow, c: 0 }, e: { r: noteTitleRow, c: colCount - 1 } });
    notes.forEach((_, index) => {
      const rowIndex = noteTitleRow + 1 + index;
      const cell = getCell(ws, rowIndex, 0);
      cell.s = {
        fill: { fgColor: { rgb: COLORS.bluePale } },
        font: { name: 'Aptos', sz: 9, italic: true, color: { rgb: COLORS.grayText } },
        alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
      };
      ws['!merges'].push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: colCount - 1 } });
    });
  }

  ws['!cols'] = safeColumns.map((column) => ({
    wch: Math.min(Math.max(Number(column.width) || 14, 9), 48),
  }));

  ws['!rows'] = [
    { hpt: 18 }, { hpt: 24 }, { hpt: 18 }, { hpt: 25 },
    { hpt: 19 }, { hpt: 18 }, { hpt: 8 }, { hpt: 24 },
  ];

  if (autoFilter && rows.length > 0) {
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: headerRow, c: 0 },
        e: { r: lastDataRow, c: colCount - 1 },
      }),
    };
  }

  if (freezeHeader) {
    ws['!freeze'] = {
      xSplit: 0, ySplit: headerRow + 1,
      topLeftCell: `A${headerRow + 2}`,
      activePane: 'bottomLeft', state: 'frozen',
    };
  }
  ws['!pageSetup'] = {
    orientation,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  };

  ws['!margins'] = {
    left: 0.35, right: 0.35, top: 0.55, bottom: 0.55,
    header: 0.2, footer: 0.2,
  };

  return ws;
};

const makeControlSheet = ({
  institution,
  companyName,
  nit,
  title,
  period,
  fileName,
  showCurrency = true,
  controlNature = 'Documento contable generado por el sistema para revisión y archivo.',
  controlNotes,
}) =>
  buildProfessionalSheet({
    institution,
    companyName,
    nit,
    title: 'FICHA DE CONTROL DEL DOCUMENTO',
    period,
    showCurrency,
    columns: [
      { key: 'Campo', label: 'Campo', width: 28 },
      { key: 'Detalle', label: 'Detalle', width: 70 },
    ],
    rows: [
      { Campo: 'Reporte', Detalle: title },
      { Campo: 'Archivo', Detalle: `${sanitizeFileName(fileName)}.xlsx` },
      { Campo: 'Entidad', Detalle: companyName },
      { Campo: 'Identificación', Detalle: normalizeNit(nit) },
      { Campo: 'Período', Detalle: period },
      { Campo: 'Fecha y hora de generación', Detalle: generatedText() },
      ...(showCurrency ? [{ Campo: 'Moneda', Detalle: 'Pesos colombianos (COP)' }] : []),
      { Campo: 'Naturaleza', Detalle: controlNature },
    ],
    notes: Array.isArray(controlNotes) && controlNotes.length
      ? controlNotes
      : [
          'Los valores deben contrastarse con comprobantes, soportes, extractos y documentos fuente.',
          'La firma o aprobación del responsable contable corresponde a los procedimientos internos de la entidad.',
        ],
  });
export const exportProfessionalWorkbook = ({
  fileName,
  institution = 'ARQUIDIÓCESIS DE BARRANQUILLA',
  companyName = '',
  nit = '',
  title = 'REPORTE CONTABLE',
  period = '',
  sheets = [],
  includeControlSheet = true,
  showCurrency = true,
  controlNature = 'Documento contable generado por el sistema para revisión y archivo.',
  controlNotes,
}) => {
  if (!Array.isArray(sheets) || sheets.length === 0) return;

  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: title,
    Subject: period,
    Author: companyName || institution,
    Company: institution,
    CreatedDate: new Date(),
  };

  sheets.forEach((sheetConfig, index) => {
    const worksheet = buildProfessionalSheet({
      institution,
      companyName,
      nit,
      title: sheetConfig.title || title,
      period: sheetConfig.period || period,
      subtitle: sheetConfig.subtitle,
      columns: sheetConfig.columns || [],
      rows: sheetConfig.rows || [],
      summaryRows: sheetConfig.summaryRows || [],
      notes: sheetConfig.notes || [],
      orientation: sheetConfig.orientation || 'portrait',
      freezeHeader: sheetConfig.freezeHeader !== false,
      autoFilter: sheetConfig.autoFilter !== false,
      showCurrency: sheetConfig.showCurrency ?? showCurrency,
    });

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      sanitizeSheetName(sheetConfig.name || `Reporte ${index + 1}`)
    );
  });
  if (includeControlSheet) {
    XLSX.utils.book_append_sheet(
      workbook,
      makeControlSheet({
        institution,
        companyName,
        nit,
        title,
        period,
        fileName,
        showCurrency,
        controlNature,
        controlNotes,
      }),
      'Control'
    );
  }

  XLSX.writeFile(workbook, `${sanitizeFileName(fileName)}.xlsx`, {
    cellStyles: true,
    compression: true,
  });
};

export const exportProfessionalTable = ({
  fileName,
  institution,
  companyName,
  nit,
  title,
  period,
  sheetName = 'Reporte',
  columns,
  rows,
  summaryRows = [],
  notes = [],
  orientation = 'portrait',
  includeControlSheet = true,
}) =>
  exportProfessionalWorkbook({
    fileName,
    institution,
    companyName,
    nit,
    title,
    period,
    includeControlSheet,
    sheets: [{
      name: sheetName,
      title,
      period,
      columns,
      rows,
      summaryRows,
      notes,
      orientation,
    }],
  });
export const exportToExcel = (data, fileName, footer) => {
  if (!Array.isArray(data) || data.length === 0) return;

  const headers = Object.keys(data[0] || {});
  const columns = headers.map((header) => {
    const lower = header.toLowerCase();
    let type = 'text';

    if (
      lower.includes('monto') ||
      lower.includes('valor') ||
      lower.includes('pago') ||
      lower.includes('ingreso') ||
      lower.includes('egreso') ||
      lower.includes('débito') ||
      lower.includes('debito') ||
      lower.includes('crédito') ||
      lower.includes('credito') ||
      lower.includes('saldo')
    ) type = 'currency';

    if (lower.includes('cantidad')) type = 'integer';

    return {
      key: header,
      label: header,
      type,
      width: type === 'currency' ? 18 : Math.min(Math.max(header.length + 5, 14), 34),
    };
  });

  const rows = data.map((row) => {
    const clean = {};
    headers.forEach((header) => {
      const value = row?.[header];
      clean[header] = value === '' || value === undefined ? null : value;
    });
    return clean;
  });

  const summaryRows = footer && Object.keys(footer).length
    ? [{ ...footer, __style: 'total' }]
    : [];

  exportProfessionalTable({
    fileName,
    title: String(fileName || 'Reporte').replace(/_/g, ' ').toUpperCase(),
    period: `Generado: ${generatedText()}`,
    columns,
    rows,
    summaryRows,
    orientation: headers.length > 5 ? 'landscape' : 'portrait',
    includeControlSheet: false,
  });
};
