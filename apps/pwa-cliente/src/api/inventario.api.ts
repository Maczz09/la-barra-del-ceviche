// api/inventario.api.ts - Llamadas al servicio de inventario

import { client } from './client';
import { unwrapArray, unwrapEntity } from './response';
import type {
  ActualizarCategoriaPayload,
  ActualizarProductoPayload,
  CategoriaDto,
  CategoriaResponse,
  CategoriasResponse,
  CrearCategoriaPayload,
  CrearProductoPayload,
  ProductoDto,
  ProductoListQuery,
  ProductoListResponse,
  ProductoResponse,
  ProductosResponse,
  AgregarAlMenuPayload,
  ActualizarMenuDiarioPayload,
  MenuDiarioItemDto,
  MenuDiarioItemResponse,
  MenuDiarioResponse,
  RegistrarMermaPayload,
  MermaListQuery,
  MermaDto,
  MermaResponse,
  MermasResponse,
} from '../types/inventario.types';

export async function getCategorias(): Promise<CategoriaDto[]> {
  const response = await client.get<CategoriasResponse | CategoriaDto[]>('/inventario/categorias');
  return unwrapArray<CategoriaDto>(response, 'categorias');
}

export async function crearCategoria(payload: CrearCategoriaPayload): Promise<CategoriaDto> {
  const response = await client.post<CategoriaResponse | CategoriaDto>('/inventario/categorias', payload);
  return unwrapEntity<CategoriaDto>(response, 'categoria');
}

export async function actualizarCategoria(id: string, payload: ActualizarCategoriaPayload): Promise<CategoriaDto> {
  const response = await client.patch<CategoriaResponse | CategoriaDto>(`/inventario/categorias/${id}`, payload);
  return unwrapEntity<CategoriaDto>(response, 'categoria');
}

export async function eliminarCategoria(id: string): Promise<void> {
  await client.delete(`/inventario/categorias/${id}`);
}

function buildProductosQuery(query: ProductoListQuery = {}): string {
  const params = new URLSearchParams();
  if (query.categoriaId) params.set('categoriaId', query.categoriaId);
  if (query.disponible != null) params.set('disponible', String(query.disponible));
  if (query.conStock != null) params.set('conStock', String(query.conStock));
  if (query.search) params.set('search', query.search);
  if (query.limit != null) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.updatedSince) params.set('updatedSince', query.updatedSince);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export async function getProductosPage(
  query: ProductoListQuery = {},
): Promise<ProductoListResponse> {
  const response = await client.get<
    ProductoListResponse | ProductosResponse | ProductoDto[]
  >(`/inventario/productos${buildProductosQuery(query)}`);

  if (
    response &&
    typeof response === 'object' &&
    'data' in response &&
    Array.isArray(response.data)
  ) {
    return response;
  }

  return {
    data: unwrapArray<ProductoDto>(response, 'productos'),
    nextCursor: null,
  };
}

export async function getProductos(categoriaId?: string): Promise<ProductoDto[]> {
  const response = await getProductosPage({ categoriaId, limit: 50 });
  return response.data;
}

export async function crearProducto(payload: CrearProductoPayload): Promise<ProductoDto> {
  const response = await client.post<ProductoResponse | ProductoDto>('/inventario/productos', payload);
  return unwrapEntity<ProductoDto>(response, 'producto');
}

export async function actualizarProducto(
  id: string,
  payload: ActualizarProductoPayload,
): Promise<ProductoDto> {
  const response = await client.patch<ProductoResponse | ProductoDto>(
    `/inventario/productos/${id}`,
    payload,
  );
  return unwrapEntity<ProductoDto>(response, 'producto');
}

export async function actualizarDisponibilidadProducto(id: string, disponible: boolean): Promise<ProductoDto> {
  const response = await client.patch<ProductoResponse | ProductoDto>(
    `/inventario/productos/${id}/disponibilidad`,
    { disponible },
  );
  return unwrapEntity<ProductoDto>(response, 'producto');
}

export async function reponerStock(id: string, cantidad: number): Promise<ProductoDto> {
  const response = await client.patch<ProductoResponse | ProductoDto>(`/inventario/productos/${id}/stock`, {
    stock: cantidad,
  });
  return unwrapEntity<ProductoDto>(response, 'producto');
}

// --- Menú del día (T-20) ---

export async function getMenuDelDia(fecha?: string): Promise<MenuDiarioItemDto[]> {
  const qs = fecha ? `?fecha=${fecha}` : '';
  const response = await client.get<MenuDiarioResponse | MenuDiarioItemDto[]>(`/inventario/menu-diario${qs}`);
  return unwrapArray<MenuDiarioItemDto>(response, 'menu');
}

export async function agregarAlMenu(payload: AgregarAlMenuPayload): Promise<MenuDiarioItemDto> {
  const response = await client.post<MenuDiarioItemResponse | MenuDiarioItemDto>('/inventario/menu-diario', payload);
  return unwrapEntity<MenuDiarioItemDto>(response, 'item');
}

export async function actualizarMenuDiario(id: string, payload: ActualizarMenuDiarioPayload): Promise<MenuDiarioItemDto> {
  const response = await client.patch<MenuDiarioItemResponse | MenuDiarioItemDto>(`/inventario/menu-diario/${id}`, payload);
  return unwrapEntity<MenuDiarioItemDto>(response, 'item');
}

export async function quitarDelMenu(id: string): Promise<void> {
  await client.delete(`/inventario/menu-diario/${id}`);
}

// --- Merma de inventario (T-22) ---

export async function getMermas(query: MermaListQuery = {}): Promise<MermaDto[]> {
  const params = new URLSearchParams();
  if (query.productoId) params.set('productoId', query.productoId);
  if (query.limit != null) params.set('limit', String(query.limit));
  const qs = params.toString();
  const response = await client.get<MermasResponse | MermaDto[]>(`/inventario/mermas${qs ? `?${qs}` : ''}`);
  return unwrapArray<MermaDto>(response, 'mermas');
}

export async function registrarMerma(payload: RegistrarMermaPayload): Promise<MermaDto> {
  const response = await client.post<MermaResponse | MermaDto>('/inventario/mermas', payload);
  return unwrapEntity<MermaDto>(response, 'merma');
}
