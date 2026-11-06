export interface Producto {
    id: string;
    categoria_id: number;
    nombre: string;
    descripcion: string;
    precio: number;
    precio_con_papas: number | null;
    imagen_url: string | null;
    stock: boolean;
    activo: boolean;
    orden: number;
}

export interface Categoria {
    id: number;
    nombre: string;
    slug: string;
    orden: number;
    modo: 'card' | 'fila';
    productos: Producto[];
}

export interface Salsa {
    id: number;
    nombre: string;
    descripcion: string;
    orden: number;
    activo: boolean;
}

export interface MenuCache {
    categorias: Categoria[];
    salsas: Salsa[];
    config: Record<string, string>;
}