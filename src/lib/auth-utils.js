/**
 * Generates the authentication serial based on the company document.
 * Formula: SECRET_KEY = (doc / 380) - 572
 * Serial = HMAC_SHA256(doc, SECRET_KEY)
 */
export async function generateCompanySerial(docNumber) {
  // Ensure we work with the numeric part of the document
  const cleanDoc = String(docNumber).trim();
  // Remove non-numeric characters for the math operation, but keep string for message if needed
  // However, usually NITs might have hyphens. Let's strip them for the math key derivation.
  const docNumericStr = cleanDoc.replace(/\D/g, '');
  const docVal = parseInt(docNumericStr, 10);
  
  if (isNaN(docVal) || docVal === 0) return null;

  // 1. Implement Formula
  // (documentoEmpresa / 380) - 572
  const keyNum = (docVal / 380) - 572;
  const secretKey = String(keyNum); // Use the string representation of the result as the key
  
  // 2. Generate HMAC SHA256
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const messageData = encoder.encode(cleanDoc); // We sign the original clean document string

  try {
    const key = await window.crypto.subtle.importKey(
      "raw", 
      keyData, 
      { name: "HMAC", hash: "SHA-256" }, 
      false, 
      ["sign"]
    );

    const signature = await window.crypto.subtle.sign(
      "HMAC", 
      key, 
      messageData
    );

    // Convert buffer to hex string
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (e) {
    console.error("Error generating serial:", e);
    return null;
  }
}