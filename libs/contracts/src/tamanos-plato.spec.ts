import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ActualizarProductoCommand, ActualizarTamanoPlatoCommand, CATALOGO_SCHEMA_VERSION, CrearProductoCommand, CrearTamanoPlatoCommand, ListarProductosQuery, ProductoDto, TamanoPlatoDto } from './index';

function errores<T extends object>(tipo: new () => T, valor: unknown) { return validateSync(plainToInstance(tipo, valor), { whitelist: true, forbidNonWhitelisted: true }); }

describe('Catálogo v2 y tamaños', () => {
  it('versiona el contrato aditivo', () => expect(CATALOGO_SCHEMA_VERSION).toBe(2));
  it('valida metadata y comandos del tamaño', () => {
    expect(errores(TamanoPlatoDto, { id: 't1', nombre: 'Personal', orden: 10, activo: true })).toEqual([]);
    expect(errores(CrearTamanoPlatoCommand, { nombre: '  Para dos  ', orden: 25 })).toEqual([]);
    expect(errores(ActualizarTamanoPlatoCommand, { activo: false, orden: 50 })).toEqual([]);
  });
  it.each([{ nombre: ' ' }, { nombre: 'x'.repeat(61) }, { nombre: 'Personal', orden: -1 }, { nombre: 'Personal', orden: 2.5 }, { nombre: 'Personal', activo: 'false' }])('rechaza tamaño inválido %j', (valor) => expect(errores(CrearTamanoPlatoCommand, valor).length).toBeGreaterThan(0));
  it.each(['nombre', 'orden', 'activo'] as const)('rechaza null en %s al crear o editar un tamaño', (campo) => {
    expect(errores(CrearTamanoPlatoCommand, { nombre: 'Personal', [campo]: null }).some((error) => error.property === campo)).toBe(true);
    expect(errores(ActualizarTamanoPlatoCommand, { [campo]: null }).some((error) => error.property === campo)).toBe(true);
  });
  it('permite omitir campos opcionales sin confundirlos con null', () => {
    expect(errores(CrearTamanoPlatoCommand, { nombre: 'Personal' })).toEqual([]);
    expect(errores(ActualizarTamanoPlatoCommand, {})).toEqual([]);
  });
  it('acepta tamaño nullable en productos, preservando clientes anteriores', () => {
    for (const extra of [{}, { tamanoId: null }, { tamanoId: 't1' }]) expect(errores(CrearProductoCommand, { nombre: 'Ceviche', categoriaId: 'c1', precio: 15, ...extra })).toEqual([]);
    expect(errores(ActualizarProductoCommand, { tamanoId: null })).toEqual([]);
    expect(errores(ProductoDto, { id: 'p1', nombre: 'Ceviche', categoriaId: 'c1', precio: 15, disponible: true, tamanoId: 't1', tamano: { id: 't1', nombre: 'Personal', orden: 10, activo: true } })).toEqual([]);
  });
  it('parsea filtros y orden desde query HTTP', () => {
    const query = plainToInstance(ListarProductosQuery, { tamanoId: 'SIN_TAMANO', ordenPorTamano: 'true', limit: '50' });
    expect(validateSync(query)).toEqual([]);
    expect(query).toMatchObject({ tamanoId: 'SIN_TAMANO', ordenPorTamano: true, limit: 50 });
  });
});
