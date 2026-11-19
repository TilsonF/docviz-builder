/**
 * Pruebas de la compresion sin perdida del PNG.
 *
 * El contrato de `optimizarPng` es estrecho a proposito: igual o menos bytes,
 * la misma geometria, los mismos pixeles. Lo que se comprueba aqui es que lo
 * cumple incluso cuando no hay nada que ganar, porque el caso en que oxipng
 * engorda un archivo es justo el que nadie mira.
 */

import { describe, expect, it } from 'vitest';
import { crc32, deflateSync } from 'node:zlib';
import { optimizarPng } from '../../src/core/png.js';
import { DocVizError, ERROR_CODES } from '../../src/core/errors.js';

const FIRMA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Arma un chunk PNG con su longitud y su CRC. */
function chunk(tipo: string, datos: Buffer): Buffer {
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const longitud = Buffer.alloc(4);
  longitud.writeUInt32BE(datos.byteLength);
  const suma = Buffer.alloc(4);
  suma.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([longitud, cuerpo, suma]);
}

/**
 * Escribe un PNG RGBA de un solo color, sin filtrar y con compresion minima.
 *
 * Es deliberadamente holgado: un color plano en RGBA de 8 bits es lo que
 * oxipng sabe reducir —a paleta o a gris— asi que sirve para comprobar que la
 * reduccion ocurre de verdad sin depender de ninguna imagen de muestra.
 */
function pngHolgado(lado = 64, color = [0x2a, 0x6f, 0xdb, 0xff]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // bits por componente
  ihdr[9] = 6; // RGBA
  const fila = Buffer.concat([
    Buffer.from([0]), // filtro: ninguno
    Buffer.concat(Array.from({ length: lado }, () => Buffer.from(color))),
  ]);
  const crudo = Buffer.concat(Array.from({ length: lado }, () => fila));
  return Buffer.concat([
    FIRMA,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(crudo, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Lee ancho, alto, profundidad y tipo de color del IHDR. */
function geometria(png: Buffer): { ancho: number; alto: number } {
  expect(png.subarray(0, 8).equals(FIRMA)).toBe(true);
  expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { ancho: png.readUInt32BE(16), alto: png.readUInt32BE(20) };
}

describe('optimizarPng', () => {
  it('recomprime un PNG holgado sin cambiar su geometria', async () => {
    const origen = pngHolgado();
    const salida = await optimizarPng(origen);
    expect(salida.byteLength).toBeLessThan(origen.byteLength);
    expect(geometria(salida)).toEqual(geometria(origen));
  });

  it('nunca devuelve mas bytes de los que recibe', async () => {
    // Dos pasadas: la segunda ya no tiene nada que ganar, y es donde un
    // optimizador que devuelve su propia salida sin comparar engordaria.
    const una = await optimizarPng(pngHolgado(32));
    const dos = await optimizarPng(una);
    expect(dos.byteLength).toBeLessThanOrEqual(una.byteLength);
  });

  it('es determinista: la misma entrada da los mismos bytes', async () => {
    const origen = pngHolgado(16);
    const a = await optimizarPng(origen);
    const b = await optimizarPng(origen);
    expect(a.equals(b)).toBe(true);
  });

  it('no toca el original', async () => {
    const origen = pngHolgado(16);
    const copia = Buffer.from(origen);
    await optimizarPng(origen);
    expect(origen.equals(copia)).toBe(true);
  });

  it('lo que no es un PNG falla con DV110 y dice que opcion apagar', async () => {
    await expect(optimizarPng(Buffer.from('esto no es un png', 'utf8'))).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof DocVizError &&
        err.code === ERROR_CODES.OPTIMIZACION_PNG &&
        (err.detail ?? '').includes('renderers.png.optimize'),
    );
  });
});
