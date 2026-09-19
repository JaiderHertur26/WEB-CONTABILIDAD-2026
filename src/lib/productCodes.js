export const sanitizeProductCode = value =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);

export const generateProductSku = (product = {}) => {
  if (product.sku) return sanitizeProductCode(product.sku);
  if (product.barcode) return sanitizeProductCode(product.barcode);
  const rawId = sanitizeProductCode(product.id || Date.now().toString());
  const compactId = rawId.replace(/^PROD[-_]?/, '').replace(/^PRD[-_]?/, '');
  const suffix = compactId.slice(-12) || Date.now().toString().slice(-12);
  return `PRD-${suffix}`;
};

export const ensureProductCodes = product => {
  const sku = generateProductSku(product);
  return {
    ...product,
    sku,
    barcode: sanitizeProductCode(product.barcode || sku),
  };
};

export const productMatchesCode = (product, rawCode) => {
  const code = sanitizeProductCode(rawCode);
  if (!code) return false;
  const normalized = ensureProductCodes(product);
  return [normalized.id, normalized.sku, normalized.barcode]
    .map(sanitizeProductCode)
    .includes(code);
};

export const productSearchText = product => {
  const p = ensureProductCodes(product);
  return [p.name, p.category, p.description, p.sku, p.barcode]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

export const buildProductQrPayload = product => {
  const p = ensureProductCodes(product);
  return p.barcode || p.sku;
};
