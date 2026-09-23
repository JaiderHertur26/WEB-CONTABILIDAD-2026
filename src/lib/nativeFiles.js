import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const safeFileName = (value) =>
  String(value || 'archivo')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_');

export const isNativeApp = () => Capacitor.isNativePlatform();

export const shareBase64File = async ({
  base64,
  fileName,
  mimeType,
  title = 'HERTUR Contabilidad',
  text,
}) => {
  if (!isNativeApp()) {
    throw new Error('La función nativa de archivos sólo está disponible dentro de la app.');
  }

  const finalName = safeFileName(fileName);
  const result = await Filesystem.writeFile({
    path: `hertur/${finalName}`,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });

  await Share.share({
    title,
    text,
    url: result.uri,
    dialogTitle: 'Guardar o compartir archivo',
  });

  return {
    uri: result.uri,
    fileName: finalName,
    mimeType,
  };
};

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('No fue posible leer el archivo.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.readAsDataURL(blob);
  });

export const shareBlobFile = async ({
  blob,
  fileName,
  mimeType,
  title = 'HERTUR Contabilidad',
  text,
}) => {
  if (!isNativeApp()) return false;
  const base64 = await blobToBase64(blob);
  await shareBase64File({ base64, fileName, mimeType, title, text });
  return true;
};

export const shareJsPdf = async (
  pdf,
  fileName,
  title = 'Documento PDF',
  text = 'Documento generado por HERTUR Contabilidad'
) => {
  if (!isNativeApp()) return false;
  const dataUri = pdf.output('datauristring');
  const base64 = String(dataUri).split(',')[1];
  await shareBase64File({
    base64,
    fileName,
    mimeType: 'application/pdf',
    title,
    text,
  });
  return true;
};
