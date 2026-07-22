import * as XLSX from 'xlsx';

function applyStylesAndFormats(worksheet, data, footer, headers) {
    const headerKeys = headers || Object.keys(data[0] || {});
    if (headerKeys.length === 0) return;
    
    const range = XLSX.utils.decode_range(worksheet['!ref']);

    // Style Headers
    headerKeys.forEach((key, i) => {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
        if (worksheet[cellRef]) {
            worksheet[cellRef].s = {
                font: { bold: true, color: { rgb: "FFFFFF" } },
                fill: { fgColor: { rgb: "4F81BD" } },
                alignment: { horizontal: 'center', vertical: 'center' },
            };
        }
    });

    // Style Data Rows and apply formats
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellRef = XLSX.utils.encode_cell({ c: C, r: R });
            if (!worksheet[cellRef]) continue;

            const headerName = headerKeys[C].toLowerCase();
            
            if (!worksheet[cellRef].s) worksheet[cellRef].s = {};

            if (headerName === 'comprobante') {
                worksheet[cellRef].t = 's'; // Set type to string
                worksheet[cellRef].s.numFmt = '@'; // Set format to Text
                worksheet[cellRef].s.alignment = { horizontal: 'left' };
            } else if (headerName === 'cantidad') {
                worksheet[cellRef].t = 'n';
                worksheet[cellRef].s.numFmt = '0'; // Set format to Number
                worksheet[cellRef].s.alignment = { horizontal: 'center' };
            } else if (worksheet[cellRef].t === 'n') { // It's a number
                if (headerName.includes('nit') || headerName.includes('cédula')) {
                    worksheet[cellRef].s.numFmt = '0'; // Format as number without decimals
                    worksheet[cellRef].s.alignment = { horizontal: 'left' };
                } else {
                    worksheet[cellRef].s.numFmt = '$ #,##0.00;[Red]-$ #,##0.00';
                    worksheet[cellRef].s.alignment = { horizontal: 'right' };
                }
            } else { // It's text
                worksheet[cellRef].s.alignment = { horizontal: 'left' };
                // Check if cell value exists before trying to access its properties
                if (worksheet[cellRef].v && (worksheet[cellRef].v.startsWith('PATRIMONIO') || worksheet[cellRef].v.startsWith('DEUDAS') || worksheet[cellRef].v.startsWith('INGRESOS') || worksheet[cellRef].v.startsWith('COSTOS') || worksheet[cellRef].v.startsWith('RENTA'))) {
                    worksheet[cellRef].s.font = { bold: true };
                }
            }
        }
    }

    // Style Footer
    if (footer) {
        const footerRowIndex = range.e.r; // Footer is now the last row of data
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellRef = XLSX.utils.encode_cell({ r: footerRowIndex, c: C });
            if (worksheet[cellRef]) {
                if (!worksheet[cellRef].s) worksheet[cellRef].s = {};
                worksheet[cellRef].s.font = { bold: true };
                worksheet[cellRef].s.border = { top: { style: "thin" } };
                if (worksheet[cellRef].t === 'n') {
                    worksheet[cellRef].s.numFmt = '$ #,##0.00;[Red]-$ #,##0.00';
                    worksheet[cellRef].s.alignment = { horizontal: 'right' };
                }
            }
        }
    }

    // Adjust column widths
    const colWidths = headerKeys.map((key, i) => {
        let maxLength = (key || '').toString().length;
        for(let j=0; j<data.length; j++) {
            const cellValue = data[j][key];
            if (cellValue != null) {
                const len = typeof cellValue === 'number' 
                    ? Math.floor(cellValue).toString().length + 5 // For currency format
                    : cellValue.toString().length;
                if (len > maxLength) {
                    maxLength = len;
                }
            }
        }
        return { wch: maxLength + 2 };
    });
    worksheet['!cols'] = colWidths;
}

export const exportToExcel = (data, fileName, footer) => {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  
  // Ensure numeric columns are actually numbers
  const processedData = data.map(row => {
      const newRow = {};
      headers.forEach(header => {
          const value = row[header];
          const lowerHeader = header.toLowerCase();

          if (lowerHeader === 'comprobante') {
            newRow[header] = String(value); // Force to string
          } else if (lowerHeader === 'cantidad') {
            const num = parseInt(value, 10);
            newRow[header] = isNaN(num) ? 0 : num;
          } else if (typeof value === 'string' && (lowerHeader.includes('monto') || lowerHeader.includes('valor') || lowerHeader.includes('pago') || lowerHeader.includes('ingreso'))) {
              const num = parseFloat(value);
              newRow[header] = isNaN(num) ? value : num;
          } else if(lowerHeader.includes('nit') || lowerHeader.includes('cédula')) {
              const num = parseFloat(value);
              newRow[header] = isNaN(num) ? value : num;
          }
          else {
              newRow[header] = value;
          }
      });
      return newRow;
  });

  const worksheet = XLSX.utils.json_to_sheet(processedData, { header: headers });

  let dataForFormatting = [...processedData];

  if (footer) {
      const footerRow = {};
      headers.forEach(h => footerRow[h] = null); // initialize empty
      Object.keys(footer).forEach(key => {
          if (headers.includes(key)) footerRow[key] = footer[key];
      });

      XLSX.utils.sheet_add_json(worksheet, [footerRow], {
          header: headers,
          skipHeader: true,
          origin: -1,
      });
      dataForFormatting.push(footerRow);
  }
  
  applyStylesAndFormats(worksheet, dataForFormatting, footer, headers);
  
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos');
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
};