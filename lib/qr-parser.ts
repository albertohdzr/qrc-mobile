/**
 * Parsea una URL de QR y extrae el código de 5 dígitos
 * 
 * Formatos soportados:
 * 1. https://qrc.team5526.com/public/qr/{uuid}/{uuid}/{code5}/
 * 2. https://sale.team5526.com/view-qr-info?qrId={code5}&...
 * 
 * En ambos casos, el código es un número de 5 dígitos
 */
export function parseQrCode(data: string): string | null {
    console.log("parseQrCode", data);
  if (!data) return null

  // Intentar extraer un número de 5 dígitos de la URL
  // Buscamos un número de exactamente 5 dígitos que sea parte del path o query param
  
  // Formato 1: El código está al final del path como /30641/
  const pathMatch = data.match(/\/(\d{5})\/?(?:\?|$|#)/)
  if (pathMatch) {
    return pathMatch[1]
  }

  // Formato 2: El código está en el query param qrId=82807
  const qrIdMatch = data.match(/[?&]qrId=(\d{5})(?:&|$)/)
  if (qrIdMatch) {
    return qrIdMatch[1]
  }

  // Fallback: buscar cualquier secuencia de 5 dígitos
  // Primero intentamos con números de exactamente 5 dígitos rodeados de no-dígitos
  const genericMatch = data.match(/(?:^|[^\d])(\d{5})(?:[^\d]|$)/)
  if (genericMatch) {
    return genericMatch[1]
  }

  return null
}

/**
 * Valida que el código sea un string de 5 dígitos
 */
export function isValidCode5(code: string | null): code is string {
  if (!code) return false
  return /^\d{5}$/.test(code)
}

/**
 * Formatea el código para mostrar (con padding de ceros si es necesario)
 */
export function formatCode5(code: string): string {
  return code.padStart(5, '0')
}
