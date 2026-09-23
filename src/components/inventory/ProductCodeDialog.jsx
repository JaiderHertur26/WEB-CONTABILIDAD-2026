import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { jsPDF } from 'jspdf';
import { Download, Printer, QrCode, Barcode } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { buildProductQrPayload, ensureProductCodes } from '@/lib/productCodes';
import { isNativeApp, shareBase64File, shareBlobFile, shareJsPdf } from '@/lib/nativeFiles';

const downloadDataUrl = async (dataUrl, filename) => {
  if (isNativeApp()) {
    const [header, base64] = String(dataUrl || '').split(',');
    const mimeType = header?.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
    await shareBase64File({
      base64,
      fileName: filename,
      mimeType,
      title: 'Código de producto',
    });
    return;
  }

  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
};

const svgToPngDataUrl = (svgText, width = 720, height = 220) =>
  new Promise((resolve, reject) => {
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };

    img.src = url;
  });

const ProductCodeDialog = ({ open, onOpenChange, product }) => {
  const normalized = useMemo(() => product ? ensureProductCodes(product) : null, [product]);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const barcodeRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (!open || !normalized) return undefined;

    QRCode.toDataURL(buildProductQrPayload(normalized), {
      width: 360,
      margin: 2,
      errorCorrectionLevel: 'M',
    }).then(url => {
      if (!cancelled) setQrDataUrl(url);
    }).catch(console.error);

    if (barcodeRef.current) {
      barcodeRef.current.innerHTML = '';
      JsBarcode(barcodeRef.current, normalized.barcode, {
        format: 'CODE128',
        displayValue: true,
        height: 70,
        margin: 8,
        fontSize: 16,
      });
    }

    return () => { cancelled = true; };
  }, [open, normalized]);

  if (!normalized) return null;
  const downloadBarcode = async () => {
    if (!barcodeRef.current) return;
    const serializer = new XMLSerializer();
    const svgText = serializer.serializeToString(barcodeRef.current);
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const fileName = `${normalized.sku}-barcode.svg`;

    if (isNativeApp()) {
      await shareBlobFile({
        blob,
        fileName,
        mimeType: 'image/svg+xml',
        title: 'Código de barras del producto',
      });
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printLabel = async () => {
    const barcodeSvg = barcodeRef.current ? new XMLSerializer().serializeToString(barcodeRef.current) : '';

    if (isNativeApp()) {
      if (!qrDataUrl || !barcodeSvg) return;

      const barcodePng = await svgToPngDataUrl(barcodeSvg);
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [88, 48] });

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      const productName = String(normalized.name || '').replace(/[<>]/g, '');
      const nameLines = pdf.splitTextToSize(productName, 80);
      pdf.text(nameLines.slice(0, 2), 44, 5, { align: 'center' });

      const nameHeight = Math.min(2, nameLines.length) * 3.5;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      pdf.text(`SKU: ${normalized.sku}`, 44, 6.5 + nameHeight, { align: 'center' });

      const codeTop = 10 + nameHeight;
      pdf.addImage(qrDataUrl, 'PNG', 4, codeTop, 28, 28);
      pdf.addImage(barcodePng, 'PNG', 34, codeTop + 4, 50, 20);

      await shareJsPdf(
        pdf,
        `${normalized.sku}-etiqueta.pdf`,
        'Etiqueta QR + código de barras',
        `Etiqueta del producto ${normalized.name || normalized.sku}`
      );
      return;
    }

    const w = window.open('', '_blank', 'width=620,height=780');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Etiqueta ${normalized.sku}</title>
      <style>body{font-family:Arial,sans-serif;margin:0;padding:24px}.label{width:88mm;min-height:48mm;border:1px solid #bbb;border-radius:8px;padding:10px;box-sizing:border-box;text-align:center}.name{font-size:15px;font-weight:700;margin-bottom:4px}.sku{font-size:11px;color:#555;margin-bottom:5px}.codes{display:flex;align-items:center;justify-content:center;gap:8px}.qr{width:28mm;height:28mm}.bar{width:50mm;max-height:27mm}svg{max-width:100%;height:auto}@media print{body{padding:0}.label{border:0}}</style>
      </head><body><div class="label"><div class="name">${String(normalized.name || '').replace(/[<>]/g,'')}</div><div class="sku">SKU: ${normalized.sku}</div><div class="codes"><img class="qr" src="${qrDataUrl}"/><div class="bar">${barcodeSvg}</div></div></div><script>window.onload=()=>{window.print();}</script></body></html>`);
    w.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Códigos del producto</DialogTitle></DialogHeader>
        <div className="space-y-5 py-2">
          <div className="rounded-xl border bg-slate-50 p-4">
            <div className="font-bold text-lg">{normalized.name}</div>
            <div className="text-sm text-slate-600">SKU: <span className="font-mono font-semibold">{normalized.sku}</span></div>
            <div className="text-sm text-slate-600">Código de barras: <span className="font-mono font-semibold">{normalized.barcode}</span></div>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            <div className="border rounded-xl p-4 text-center">
              <div className="font-semibold flex items-center justify-center gap-2 mb-3"><QrCode className="w-4 h-4"/>Código QR</div>
              {qrDataUrl ? <img src={qrDataUrl} alt="QR del producto" className="w-52 h-52 mx-auto"/> : <div className="h-52 grid place-items-center text-slate-400">Generando…</div>}
              <Button variant="outline" className="mt-3" disabled={!qrDataUrl} onClick={()=>downloadDataUrl(qrDataUrl,`${normalized.sku}-qr.png`)}><Download className="w-4 h-4 mr-2"/>{isNativeApp() ? 'Compartir QR' : 'QR PNG'}</Button>
            </div>
            <div className="border rounded-xl p-4 text-center">
              <div className="font-semibold flex items-center justify-center gap-2 mb-3"><Barcode className="w-4 h-4"/>Código de barras CODE128</div>
              <div className="min-h-52 grid place-items-center"><svg ref={barcodeRef} className="max-w-full"/></div>
              <Button variant="outline" className="mt-3" onClick={downloadBarcode}><Download className="w-4 h-4 mr-2"/>{isNativeApp() ? 'Compartir barras' : 'Barcode SVG'}</Button>
            </div>
          </div>
          <Button className="w-full" onClick={printLabel}><Printer className="w-4 h-4 mr-2"/>{isNativeApp() ? 'Compartir etiqueta PDF' : 'Imprimir etiqueta QR + barras'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProductCodeDialog;
