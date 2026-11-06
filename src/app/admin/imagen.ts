// Convierte la foto que sube el cliente (jpg, png, webp, heic si el navegador lo soporta…) a WebP liviano.
// Se achica a 1200 px de lado máximo, que alcanza para la ficha (4:3) y la card (124 px).

const LADO_MAX = 1200;
const CALIDAD = 0.82;
const PESO_MAX = 2 * 1024 * 1024; // límite del bucket "productos"

export async function aWebp(archivo: File): Promise<Blob> {
  if (!archivo.type.startsWith('image/')) {
    throw new Error('El archivo no es una imagen.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(archivo);
  } catch {
    throw new Error('No se pudo leer la imagen. Probá con un JPG o PNG.');
  }

  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
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

  // Si queda pesada se baja la calidad de a poco
  for (let calidad = CALIDAD; calidad >= 0.5; calidad -= 0.1) {
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', calidad));
    if (!blob || blob.type !== 'image/webp') {
      throw new Error('Este navegador no puede convertir a WebP. Probá desde Chrome, Edge o Firefox.');
    }
    if (blob.size <= PESO_MAX) return blob;
  }
  throw new Error('La imagen es demasiado grande, incluso después de optimizarla.');
}

export function pesoLegible(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
