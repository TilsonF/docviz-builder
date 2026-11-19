/**
 * El caso en que el optimizador no se puede cargar.
 *
 * Va en su propio archivo porque el modulo recuerda la carga: una vez resuelta
 * no se repite, asi que simularla fallando exige un registro de modulos
 * limpio. El mensaje importa tanto como el fallo —dice que opcion apagar— y
 * sin esto nadie lo leeria hasta que le ocurriera en un build.
 */

import { describe, expect, it, vi } from 'vitest';
import { DocVizError, ERROR_CODES } from '../../src/core/errors.js';

vi.mock('@jsquash/oxipng/optimise.js', () => {
  throw new Error('wasm no disponible en esta maquina');
});

describe('optimizarPng sin el modulo WASM', () => {
  it('falla con DV110 y dice como seguir sin comprimir', async () => {
    const { optimizarPng } = await import('../../src/core/png.js');
    const error = await optimizarPng(Buffer.alloc(8)).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(DocVizError);
    const docviz = error as DocVizError;
    expect(docviz.code).toBe(ERROR_CODES.OPTIMIZACION_PNG);
    expect(docviz.message).toContain('no se pudo cargar');
    expect(docviz.detail).toContain('renderers.png.optimize');
  });
});
