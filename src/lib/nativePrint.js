import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { isNativeApp, shareJsPdf } from '@/lib/nativeFiles';

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const fileSafe = (value) =>
  String(value || 'Reporte_HERTUR')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'Reporte_HERTUR';

const titleFromHtml = (html) => {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return 'Reporte HERTUR';
  const parser = document.createElement('textarea');
  parser.innerHTML = match[1].replace(/<[^>]*>/g, '');
  return parser.value.trim() || 'Reporte HERTUR';
};

const orientationFromHtml = (html) =>
  /(?:@page[\s\S]{0,250}?size\s*:[^;}]*landscape|size\s*:\s*(?:(?:a4|letter|legal)\s+)?landscape)/i.test(String(html || ''))
    ? 'landscape'
    : 'portrait';

const pageFormatFromHtml = (html) => {
  const source = String(html || '');
  if (/size\s*:\s*legal\b/i.test(source)) return 'legal';
  if (/size\s*:\s*letter\b/i.test(source)) return 'letter';
  return 'a4';
};

const pagePixels = {
  a4: { width: 794, height: 1123 },
  letter: { width: 816, height: 1056 },
  legal: { width: 816, height: 1344 },
};

const waitForDocumentAssets = async (doc) => {
  try {
    if (doc.fonts?.ready) await doc.fonts.ready;
  } catch {
    // La fuente del sistema es una alternativa válida.
  }

  const images = Array.from(doc.images || []);
  await Promise.all(images.map(async image => {
    if (image.complete) {
      try { await image.decode?.(); } catch { /* imagen ya utilizable */ }
      return;
    }

    await Promise.race([
      new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      }),
      wait(2500),
    ]);
  }));
};

export const sharePrintableHtml = async ({
  html,
  title,
  fileName,
  orientation,
  pageFormat,
}) => {
  if (!isNativeApp()) {
    throw new Error('La conversión HTML a PDF nativo sólo está disponible dentro de la app.');
  }

  const resolvedTitle = title || titleFromHtml(html);
  const resolvedOrientation = orientation || orientationFromHtml(html);
  const resolvedPageFormat = pageFormat || pageFormatFromHtml(html);
  const resolvedFileName = fileName || `${fileSafe(resolvedTitle)}.pdf`;
  const pixels = pagePixels[resolvedPageFormat] || pagePixels.a4;
  const pageWidthPx = resolvedOrientation === 'landscape' ? pixels.height : pixels.width;
  const pageHeightPx = resolvedOrientation === 'landscape' ? pixels.width : pixels.height;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.left = '-100000px';
  iframe.style.top = '0';
  iframe.style.width = `${pageWidthPx}px`;
  iframe.style.height = '1200px';
  iframe.style.border = '0';
  iframe.style.background = '#ffffff';
  iframe.style.pointerEvents = 'none';

  document.body.appendChild(iframe);

  try {
    const frameDoc = iframe.contentDocument;
    if (!frameDoc) throw new Error('No fue posible preparar el documento de impresión.');

    const safeHtml = String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    frameDoc.open();
    frameDoc.write(safeHtml);
    frameDoc.close();

    await wait(250);
    await waitForDocumentAssets(frameDoc);

    const body = frameDoc.body;
    if (!body) throw new Error('El reporte no contiene un cuerpo imprimible.');

    body.style.background = '#ffffff';
    body.style.margin = body.style.margin || '0';

    const contentWidth = Math.max(pageWidthPx, body.scrollWidth, frameDoc.documentElement?.scrollWidth || 0);
    const contentHeight = Math.max(1, body.scrollHeight, frameDoc.documentElement?.scrollHeight || 0);

    iframe.style.width = `${contentWidth}px`;
    iframe.style.height = `${Math.min(contentHeight + 20, 12000)}px`;

    await wait(80);

    const pdf = new jsPDF({
      orientation: resolvedOrientation,
      unit: 'mm',
      format: resolvedPageFormat,
      compress: true,
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const longDocument = contentHeight > 9000;

    if (!longDocument) {
      const canvas = await html2canvas(body, {
        scale: 1.35,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: contentWidth,
        height: contentHeight,
        windowWidth: contentWidth,
        windowHeight: contentHeight,
        scrollX: 0,
        scrollY: 0,
      });

      const imageData = canvas.toDataURL('image/jpeg', 0.93);
      const imageHeight = (canvas.height * pageWidth) / canvas.width;

      let position = 0;
      let remaining = imageHeight;

      pdf.addImage(imageData, 'JPEG', 0, position, pageWidth, imageHeight, undefined, 'FAST');
      remaining -= pageHeight;

      while (remaining > 0.5) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imageData, 'JPEG', 0, position, pageWidth, imageHeight, undefined, 'FAST');
        remaining -= pageHeight;
      }
    } else {
      const sourcePageHeight = Math.max(
        600,
        Math.floor(contentWidth * (pageHeightPx / pageWidthPx))
      );
      const totalPages = Math.ceil(contentHeight / sourcePageHeight);

      for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
        const offsetY = pageIndex * sourcePageHeight;
        const sliceHeight = Math.min(sourcePageHeight, contentHeight - offsetY);

        const canvas = await html2canvas(body, {
          scale: 1.15,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
          width: contentWidth,
          height: sliceHeight,
          x: 0,
          y: offsetY,
          windowWidth: contentWidth,
          windowHeight: Math.min(Math.max(sliceHeight, 1200), 6000),
          scrollX: 0,
          scrollY: 0,
        });

        if (pageIndex > 0) pdf.addPage();

        const imageData = canvas.toDataURL('image/jpeg', 0.92);
        const imageHeight = (canvas.height * pageWidth) / canvas.width;
        pdf.addImage(imageData, 'JPEG', 0, 0, pageWidth, imageHeight, undefined, 'FAST');

        await wait(15);
      }
    }

    await shareJsPdf(
      pdf,
      resolvedFileName,
      resolvedTitle,
      'Documento generado por HERTUR Contabilidad'
    );
  } finally {
    iframe.remove();
  }
};

export const createPrintTarget = (features = 'width=1000,height=800') => {
  if (!isNativeApp()) {
    return window.open('', '_blank', features);
  }

  let html = '';

  return {
    document: {
      write: (content) => {
        html += String(content ?? '');
      },
      close: () => {},
    },
    focus: () => {},
    print: () => {
      void sharePrintableHtml({ html })
        .catch((error) => console.error('[HERTUR] No fue posible generar el PDF nativo del reporte.', error));
    },
    close: () => {},
  };
};
