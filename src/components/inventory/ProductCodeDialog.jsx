import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { Download, Printer, QrCode, Barcode } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { buildProductQrPayload, ensureProductCodes } from '@/lib/productCodes';

const downloadDataUrl = (dataUrl, filename) => {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
};

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
  const downloadBarcode = () => {
    if (!barcodeRef.current) return;
    const serializer = new XMLSerializer();
    const svgText = serializer.serializeToString(barcodeRef.current);
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${normalized.sku}-barcode.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printLabel = () => {
    const barcodeSvg = barcodeRef.current ? new XMLSerializer().serializeToString(barcodeRef.current) : '';
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
              <Button variant="outline" className="mt-3" disabled={!qrDataUrl} onClick={()=>downloadDataUrl(qrDataUrl,`${normalized.sku}-qr.png`)}><Download className="w-4 h-4 mr-2"/>QR PNG</Button>
            </div>
            <div className="border rounded-xl p-4 text-center">
              <div className="font-semibold flex items-center justify-center gap-2 mb-3"><Barcode className="w-4 h-4"/>Código de barras CODE128</div>
              <div className="min-h-52 grid place-items-center"><svg ref={barcodeRef} className="max-w-full"/></div>
              <Button variant="outline" className="mt-3" onClick={downloadBarcode}><Download className="w-4 h-4 mr-2"/>Barcode SVG</Button>
            </div>
          </div>
          <Button className="w-full" onClick={printLabel}><Printer className="w-4 h-4 mr-2"/>Imprimir etiqueta QR + barras</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProductCodeDialog;
