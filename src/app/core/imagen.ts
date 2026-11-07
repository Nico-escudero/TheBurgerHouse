// Convierte una foto (jpg, png, webp, heic si el navegador lo soporta…) a WebP liviano.
// Safari (iPhone/iPad/Mac) no sabe generar WebP: ahí se usa JPEG, que todos soportan.
// Fotos de productos: 1200 px de lado máximo, alcanza para la ficha (4:3) y la card (124 px).
// Comprobantes de pago: se pasa un lado mayor (capturas altas de la app del banco, texto legible).

const LADO_MAX = 1200;
const CALIDAD = 0.82;
const PESO_MAX = 2 * 1024 * 1024; // límite del bucket "productos"

export async function aWebp(archivo: File, ladoMax = LADO_MAX): Promise<Blob> {
  if (!archivo.type.startsWith('image/')) {
    throw new Error('El archivo no es una imagen.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(archivo);
  } catch {
    throw new Error('No se pudo leer la imagen. Probá con un JPG o PNG.');
  }

  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);

  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no pudo procesar la imagen.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  // Si queda pesada se baja la calidad de a poco.
  // Si el navegador no genera WebP (devuelve PNG), se pasa a JPEG en el mismo ciclo.
  let formato: 'image/webp' | 'image/jpeg' = 'image/webp';
  for (let calidad = CALIDAD; calidad >= 0.5; calidad -= 0.1) {
    let blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, formato, calidad));
    if (formato === 'image/webp' && blob?.type !== 'image/webp') {
      formato = 'image/jpeg';
      blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, formato, calidad));
    }
    if (!blob) throw new Error('El navegador no pudo procesar la imagen.');
    if (blob.size <= PESO_MAX) return blob;
  }
  throw new Error('La imagen es demasiado grande, incluso después de optimizarla.');
}

// Extensión de archivo según el formato que salió (webp en Chrome/Firefox, jpg en Safari)
export function extensionDe(blob: Blob): string {
  return blob.type === 'image/jpeg' ? 'jpg' : 'webp';
}

export function pesoLegible(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
