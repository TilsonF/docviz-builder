/**
 * Pruebas de los datos de un grafico leidos de un archivo.
 *
 * Un informe saca sus numeros de una exportacion, y teclearlos dentro del
 * bloque hace que el grafico no se pueda regenerar cuando el dato cambia. Lo
 * que se comprueba aqui es que se lean bien —incluida la coma dentro de un
 * campo, que es donde fallan los lectores de CSV improvisados— y que la ruta no
 * pueda salirse de donde debe.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compileDsl, leerSeparado, resolverDatos } from '../../src/dsl/index.js';
import { DslValidationError } from '../../src/core/errors.js';

const temps: string[] = [];

async function proyecto(archivos: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'docviz-datos-'));
  temps.push(root);
  for (const [relativo, contenido] of Object.entries(archivos)) {
    const destino = path.join(root, relativo);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, contenido, 'utf8');
  }
  return root;
}

const bloque = (...lineas: string[]): string => lineas.join('\n');

afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

describe('lectura de CSV', () => {
  it('cabecera, filas y numeros', () => {
    const filas = leerSeparado('label,value\nEnero,120\nFebrero,95\n', ',', 'x.csv');
    expect(filas).toEqual([
      { label: 'Enero', value: 120 },
      { label: 'Febrero', value: 95 },
    ]);
  });

  it('una coma dentro de un campo entrecomillado no parte la fila', () => {
    const filas = leerSeparado('label,value\n"Marzo, con coma",143\n', ',', 'x.csv');
    expect(filas[0]).toEqual({ label: 'Marzo, con coma', value: 143 });
  });

  it('las comillas se escapan duplicandolas, como en una hoja de calculo', () => {
    const filas = leerSeparado('label,value\n"Dijo ""hola""",1\n', ',', 'x.csv');
    expect(filas[0]!['label']).toBe('Dijo "hola"');
  });

  it('lo que parece un codigo se queda como texto', () => {
    // `007` es un identificador y `1,5` es ambiguo segun el pais: convertirlos
    // seria decidir por el autor.
    const filas = leerSeparado('id,nota\n007,1.5\n', ',', 'x.csv');
    expect(filas[0]).toEqual({ id: '007', nota: 1.5 });
  });

  it('admite CRLF, BOM y una linea en blanco al final', () => {
    const filas = leerSeparado('﻿label,value\r\nEnero,1\r\n\r\n', ',', 'x.csv');
    expect(filas).toEqual([{ label: 'Enero', value: 1 }]);
  });

  it('una fila con campos de mas se reporta con su numero de linea', () => {
    expect(() => leerSeparado('a,b\n1,2,3\n', ',', 'x.csv')).toThrow(/fila 2 tiene 3 campos/);
  });

  it('una columna sin nombre no se acepta', () => {
    expect(() => leerSeparado('a,,c\n1,2,3\n', ',', 'x.csv')).toThrow(/columna sin nombre/);
  });

  it('un archivo sin filas de datos tampoco', () => {
    expect(() => leerSeparado('a,b\n', ',', 'x.csv')).toThrow(/ninguna fila/);
  });
});

describe('en un bloque de verdad', () => {
  it('el CSV sustituye a `data` y el grafico compila', async () => {
    const root = await proyecto({ 'docs/ventas.csv': 'label,value\nEnero,120\nFebrero,95\n' });
    const compiled = compileDsl(
      'chart',
      bloque('type: bar', 'title: Ventas', 'dataFile: ./ventas.csv'),
      () => true,
      { baseDir: path.join(root, 'docs'), root },
    );
    expect(compiled.source).toContain('Enero');
    expect(compiled.source).toContain('120');
  });

  it('tambien desde JSON, con lista suelta o bajo `data`', async () => {
    const root = await proyecto({
      'docs/a.json': '[{"label":"A","value":1}]',
      'docs/b.json': '{"data":[{"label":"B","value":2}]}',
    });
    for (const [archivo, esperado] of [['a.json', 'A'], ['b.json', 'B']] as const) {
      const compiled = compileDsl('chart', bloque('type: bar', `dataFile: ./${archivo}`), () => true, {
        baseDir: path.join(root, 'docs'),
        root,
      });
      expect(compiled.source).toContain(esperado);
    }
  });

  it('no genera aviso de campo desconocido', async () => {
    // `dataFile` no es un campo del tipo, es del bloque: si el analisis de
    // campos no lo supiera, cada grafico con datos externos avisaria.
    const root = await proyecto({ 'docs/v.csv': 'label,value\nA,1\n' });
    const compiled = compileDsl('chart', bloque('type: bar', 'dataFile: ./v.csv'), () => true, {
      baseDir: path.join(root, 'docs'),
      root,
    });
    expect(compiled.warnings).toBeUndefined();
  });
});

describe('lo que no se permite', () => {
  const contexto = { baseDir: '/tmp/docs', root: '/tmp' };
  const fallar = (doc: Record<string, unknown>, ctx = contexto): DslValidationError => {
    try {
      resolverDatos(doc, ctx);
    } catch (err) {
      return err as DslValidationError;
    }
    throw new Error('se esperaba un error y no lo hubo');
  };

  it('una URL, por mucho que sea https', () => {
    const err = fallar({ dataFile: 'https://ejemplo.test/v.csv' });
    expect(err.message).toContain('no admite URLs');
    // El motivo importa: no es una limitacion tecnica, es la promesa del build.
    expect(err.detail).toContain('confidencial');
  });

  it('una ruta que sale del arbol de origen', () => {
    expect(fallar({ dataFile: '../../../../etc/passwd' }).message).toContain('fuera del directorio de origen');
  });

  it('declarar `data` y `dataFile` a la vez', () => {
    expect(fallar({ dataFile: './v.csv', data: [] }).message).toContain('a la vez');
  });

  it('un formato que no se sabe leer', () => {
    expect(fallar({ dataFile: './v.xlsx' }).message).toContain('no sabe leer');
  });

  it('compilar el bloque suelto, sin documento del que partir', () => {
    let err: DslValidationError | undefined;
    try {
      resolverDatos({ dataFile: './v.csv' }, undefined);
    } catch (e) {
      err = e as DslValidationError;
    }
    expect(err?.message).toContain('solo funciona al compilar un documento');
  });

  it('un archivo que no existe, diciendo donde se busco', async () => {
    const root = await proyecto({});
    const err = fallar({ dataFile: './no-esta.csv' }, { baseDir: root, root });
    expect(err.message).toContain('no se encuentra');
    expect(err.detail).toContain('relativa al documento');
  });

  it('sin `dataFile` no toca nada', () => {
    const doc: Record<string, unknown> = { type: 'bar', data: [{ label: 'A', value: 1 }] };
    resolverDatos(doc, contexto);
    expect(doc['data']).toEqual([{ label: 'A', value: 1 }]);
  });
});
