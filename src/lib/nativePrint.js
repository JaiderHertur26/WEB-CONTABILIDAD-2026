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

const measureRenderedContentHeight = (doc, body) => {
  const bodyRect = body.getBoundingClientRect();
  let bottom = bodyRect.top;

  try {
    const range = doc.createRange();
    range.selectNodeContents(body);
    const rangeRect = range.getBoundingClientRect();
    if (Number.isFinite(rangeRect.bottom)) bottom = Math.max(bottom, rangeRect.bottom);
  } catch {
    // Algunos nodos no admiten Range; los descendientes cubren ese caso.
  }

  for (const element of Array.from(body.querySelectorAll('*'))) {
    if (['SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE'].includes(element.tagName)) continue;
    const style = doc.defaultView?.getComputedStyle(element);
    if (!style || style.display === 'none' || style.visibility === 'hidden') continue;

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (Number.isFinite(rect.bottom)) bottom = Math.max(bottom, rect.bottom);
  }

  // Conserva una pequeña respiración inferior, pero no padding/min-height vacíos.
  return Math.max(1, Math.ceil(bottom - bodyRect.top + 8));
};

const cropCanvasBottomWhitespace = (sourceCanvas, extraPadding = 10) => {
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || sourceCanvas.width < 1 || sourceCanvas.height < 1) return sourceCanvas;

  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  let lastContentRow = -1;
  const rowChunk = 24;
  const sampleStep = Math.max(1, Math.floor(width / 420));

  for (let startY = height - rowChunk; startY >= 0 && lastContentRow < 0; startY -= rowChunk) {
    const y = Math.max(0, startY);
    const h = Math.min(rowChunk, height - y);
    const pixels = ctx.getImageData(0, y, width, h).data;

    for (let localY = h - 1; localY >= 0 && lastContentRow < 0; localY -= 1) {
      for (let x = 0; x < width; x += sampleStep) {
        const i = (localY * width + x) * 4;
        const alpha = pixels[i + 3];
        if (alpha > 8 && (pixels[i] < 248 || pixels[i + 1] < 248 || pixels[i + 2] < 248)) {
          lastContentRow = y + localY;
          break;
        }
      }
    }
  }

  if (lastContentRow < 0) return sourceCanvas;

  const croppedHeight = Math.min(height, lastContentRow + 1 + extraPadding);
  if (croppedHeight >= height - 2) return sourceCanvas;

  const cropped = document.createElement('canvas');
  cropped.width = width;
  cropped.height = croppedHeight;
  const croppedCtx = cropped.getContext('2d');
  croppedCtx.fillStyle = '#ffffff';
  croppedCtx.fillRect(0, 0, width, croppedHeight);
  croppedCtx.drawImage(sourceCanvas, 0, 0, width, croppedHeight, 0, 0, width, croppedHeight);
  return cropped;
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
    const rawContentHeight = Math.max(1, body.scrollHeight, frameDoc.documentElement?.scrollHeight || 0);
    const measuredContentHeight = measureRenderedContentHeight(frameDoc, body);
    const contentHeight = Math.min(rawContentHeight, Math.max(1, measuredContentHeight));

    iframe.style.width = `${contentWidth}px`;
    iframe.style.height = `${Math.min(contentHeight + 8, 12000)}px`;

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
      const capturedCanvas = await html2canvas(body, {
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

      const canvas = cropCanvasBottomWhitespace(capturedCanvas, Math.ceil(8 * 1.35));
      const nominalSourcePageHeight = Math.max(
        1,
        Math.floor(canvas.width * (pageHeight / pageWidth))
      );
      const tolerancePx = Math.ceil(nominalSourcePageHeight * (3 / pageHeight));
      let totalPages = Math.max(
        1,
        Math.ceil(Math.max(1, canvas.height - tolerancePx) / nominalSourcePageHeight)
      );
      let sourcePageHeight = nominalSourcePageHeight;

      if (totalPages > 1) {
        const trailingHeight = canvas.height - ((totalPages - 1) * nominalSourcePageHeight);
        const trailingRatio = trailingHeight / nominalSourcePageHeight;
        const compressedSourcePageHeight = Math.ceil(canvas.height / (totalPages - 1));
        const uniformScaleRatio = nominalSourcePageHeight / compressedSourcePageHeight;

        // Evita una última hoja con sólo pie/espacio residual.
        // Sólo compacta cuando el fragmento final es pequeño y la reducción total es <= 3.5%.
        if (
          trailingHeight > 0 &&
          trailingRatio <= 0.15 &&
          uniformScaleRatio >= 0.965
        ) {
          totalPages -= 1;
          sourcePageHeight = compressedSourcePageHeight;
        }
      }

      if (totalPages === 1) {
        const imageData = canvas.toDataURL('image/jpeg', 0.93);
        const scale = Math.min(
          pageWidth / canvas.width,
          pageHeight / canvas.height
        );
        const renderedWidth = canvas.width * scale;
        const renderedHeight = canvas.height * scale;
        pdf.addImage(
          imageData,
          'JPEG',
          (pageWidth - renderedWidth) / 2,
          0,
          renderedWidth,
          renderedHeight,
          undefined,
          'FAST'
        );
      } else {
        for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
          const sourceY = pageIndex * sourcePageHeight;
          const sliceHeight = Math.min(sourcePageHeight, canvas.height - sourceY);
          if (sliceHeight <= 0) break;

          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = canvas.width;
          pageCanvas.height = sliceHeight;
          const pageCtx = pageCanvas.getContext('2d');
          pageCtx.fillStyle = '#ffffff';
          pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          pageCtx.drawImage(
            canvas,
            0,
            sourceY,
            canvas.width,
            sliceHeight,
            0,
            0,
            canvas.width,
            sliceHeight
          );

          if (pageIndex > 0) pdf.addPage();

          const imageData = pageCanvas.toDataURL('image/jpeg', 0.93);
          const scale = Math.min(
            pageWidth / pageCanvas.width,
            pageHeight / pageCanvas.height
          );
          const renderedWidth = pageCanvas.width * scale;
          const renderedHeight = pageCanvas.height * scale;
          pdf.addImage(
            imageData,
            'JPEG',
            (pageWidth - renderedWidth) / 2,
            0,
            renderedWidth,
            renderedHeight,
            undefined,
            'FAST'
          );
        }
      }
    } else {
      const nominalSourcePageHeight = Math.max(
        600,
        Math.floor(contentWidth * (pageHeightPx / pageWidthPx))
      );
      let totalPages = Math.ceil(contentHeight / nominalSourcePageHeight);
      let sourcePageHeight = nominalSourcePageHeight;

      if (totalPages > 1) {
        const trailingHeight = contentHeight - ((totalPages - 1) * nominalSourcePageHeight);
        const trailingRatio = trailingHeight / nominalSourcePageHeight;
        const compressedSourcePageHeight = Math.ceil(contentHeight / (totalPages - 1));
        const uniformScaleRatio = nominalSourcePageHeight / compressedSourcePageHeight;

        if (
          trailingHeight > 0 &&
          trailingRatio <= 0.15 &&
          uniformScaleRatio >= 0.965
        ) {
          totalPages -= 1;
          sourcePageHeight = compressedSourcePageHeight;
        }
      }

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

        const pageCanvas = pageIndex === totalPages - 1
          ? cropCanvasBottomWhitespace(canvas, Math.ceil(8 * 1.15))
          : canvas;
        const imageData = pageCanvas.toDataURL('image/jpeg', 0.92);
        const scale = Math.min(
          pageWidth / pageCanvas.width,
          pageHeight / pageCanvas.height
        );
        const renderedWidth = pageCanvas.width * scale;
        const renderedHeight = pageCanvas.height * scale;
        pdf.addImage(
          imageData,
          'JPEG',
          (pageWidth - renderedWidth) / 2,
          0,
          renderedWidth,
          renderedHeight,
          undefined,
          'FAST'
        );

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
