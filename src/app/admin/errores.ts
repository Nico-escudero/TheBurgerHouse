// Traduce los errores de Supabase / del navegador a un mensaje que diga qué pasó
export function describirError(e: unknown): string {
  const err = e as { message?: string; name?: string; status?: number; statusCode?: string | number; code?: string };
  const msg = err?.message ?? String(e);

  if (/row-level security|permission denied|not authorized|403/i.test(msg)) {
    return 'Tu usuario no tiene permiso para hacer este cambio. Salí y volvé a ingresar.';
  }
  if (/jwt|token.*expired|invalid claim|session/i.test(msg)) {
    return 'La sesión venció. Salí y volvé a ingresar.';
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return 'Sin conexión con el servidor. Revisá internet y probá de nuevo.';
  }
  if (/payload too large|maximum allowed size|413/i.test(msg)) {
    return 'La foto supera el tamaño permitido (2 MB).';
  }
  if (/mime type|invalid_mime/i.test(msg)) {
    return 'Ese formato de imagen no está permitido.';
  }
  // Cualquier otro caso: se muestra el detalle técnico para poder diagnosticarlo
  return `Error: ${msg}`;
}
