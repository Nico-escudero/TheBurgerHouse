// 19800 -> "$19.800"
export function formatoPrecio(n: number): string {
  return '$' + n.toLocaleString('es-AR');
}
