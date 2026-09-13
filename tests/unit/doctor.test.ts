/**
 * Pruebas del diagnostico del entorno.
 *
 * El diagnostico habla de la maquina, asi que probarlo contra la maquina real
 * daria un resultado distinto en cada portatil. Aqui el entorno se fabrica: un
 * ejecutable de mentira que responde como Java, un archivo que hace de
 * `plantuml.jar` y un buscador de navegador controlado. Lo que se comprueba es
 * la clasificacion —que tipos sobreviven a que ausencia—, no si hay Java.
 */

import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig } from '../../src/config/load.js';
import { resolveJarPath } from '../../src/renderers/plantuml.js';
import { diagnosticar, formatearDiagnostico, type Diagnostico, type Estado } from '../../src/build/doctor.js';
import type { DocVizConfig } from '../../src/config/types.js';

/** Navegador que ve el diagnostico. Cada prueba decide si existe. */
let navegadorSimulado: string | undefined;

vi.mock('../../src/renderers/browser.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/renderers/browser.js')>();
  return { ...actual, findBrowser: (explicit?: string) => navegadorSimulado ?? explicit };
});

const temps: string[] = [];

async function raiz(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'docviz-doctor-'));
  temps.push(dir);
  return dir;
}

/** Ejecutable que responde a `-version` como lo hace Java: por stderr. */
async function javaDeMentira(dir: string): Promise<string> {
  const ruta = path.join(dir, 'java-falso');
  await writeFile(ruta, '#!/bin/sh\necho \'openjdk version "21.0.1"\' >&2\n', 'utf8');
  await chmod(ruta, 0o755);
  return ruta;
}

interface Entorno {
  java?: string;
  jar?: string;
  plantuml?: boolean;
  mermaid?: boolean;
  bpmn?: boolean;
}

async function config(root: string, entorno: Entorno = {}): Promise<DocVizConfig> {
  const base = defaultConfig(root);
  return {
    ...base,
    rootDir: root,
    renderers: {
      ...base.renderers,
      plantuml: {
        ...base.renderers.plantuml,
        enabled: entorno.plantuml ?? true,
        ...(entorno.java !== undefined ? { java: entorno.java } : {}),
        ...(entorno.jar !== undefined ? { jar: entorno.jar } : {}),
      },
      mermaid: { ...base.renderers.mermaid, enabled: entorno.mermaid ?? true },
      bpmn: { ...base.renderers.bpmn, enabled: entorno.bpmn ?? true },
    },
  };
}

function requisito(d: Diagnostico, nombre: string): { estado: Estado; detalle: string; remedio?: string } {
  const q = d.requisitos.find((r) => r.nombre === nombre);
  if (q === undefined) throw new Error(`no hay requisito "${nombre}"`);
  return q;
}

function tipo(lista: Diagnostico['intactos'], nombre: string): Diagnostico['intactos'][number] | undefined {
  return lista.find((t) => t.tipo === nombre);
}

afterEach(() => {
  navegadorSimulado = undefined;
});

afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

describe('requisitos del entorno', () => {
  it('siempre reporta la version de Node', async () => {
    const root = await raiz();
    const d = await diagnosticar(await config(root, { plantuml: false, mermaid: false, bpmn: false }));
    expect(requisito(d, 'Node.js')).toMatchObject({ estado: 'ok', detalle: process.version });
  });

  it('con Java y el jar presentes, ambos salen en verde', async () => {
    const root = await raiz();
    const jar = path.join(root, 'plantuml.jar');
    await writeFile(jar, 'no es un jar de verdad, solo tiene que existir', 'utf8');
    navegadorSimulado = '/ruta/al/chrome';

    const d = await diagnosticar(await config(root, { java: await javaDeMentira(root), jar }));

    expect(requisito(d, 'Java').estado).toBe('ok');
    expect(requisito(d, 'Java').detalle).toContain('openjdk version');
    expect(requisito(d, 'plantuml.jar')).toMatchObject({ estado: 'ok', detalle: jar });
    expect(requisito(d, 'Chromium')).toMatchObject({ estado: 'ok', detalle: '/ruta/al/chrome' });
  });

  it('un Java que no se puede ejecutar se reporta con su remedio', async () => {
    const root = await raiz();
    const d = await diagnosticar(await config(root, { java: path.join(root, 'no-existe-java') }));

    expect(requisito(d, 'Java').estado).toBe('ausente');
    expect(requisito(d, 'Java').remedio).toContain('JRE');
  });

  it('sin jar dice donde lo buscaba y como conseguirlo', async () => {
    const root = await raiz();
    const d = await diagnosticar(
      await config(root, { java: await javaDeMentira(root), jar: path.join(root, 'no-esta.jar') }),
    );

    const jar = requisito(d, 'plantuml.jar');
    expect(jar.estado).toBe('ausente');
    expect(jar.detalle).toContain('no-esta.jar');
    // `npm run setup` no existe para quien lo instala como dependencia.
    expect(jar.remedio).toContain('npx docviz setup');
  });

  it('busca el jar donde lo busca el renderer, no en la raiz del proyecto', async () => {
    const root = await raiz();
    const d = await diagnosticar(await config(root, { java: await javaDeMentira(root) }));

    // Resolverlo contra la raiz daba un falso negativo en todo proyecto que
    // instalara DocViz: el jar viaja dentro del paquete.
    const jar = requisito(d, 'plantuml.jar');
    expect(jar.detalle).toBe(resolveJarPath());
    expect(jar.detalle.startsWith(root)).toBe(false);
  });

  it('sin navegador se explica como instalarlo', async () => {
    const root = await raiz();
    navegadorSimulado = undefined;
    const d = await diagnosticar(await config(root, { mermaid: true, bpmn: true }));

    expect(requisito(d, 'Chromium').estado).toBe('ausente');
    expect(requisito(d, 'Chromium').remedio).toContain('DOCVIZ_BROWSER_PATH');
  });

  it('lo deshabilitado no se reporta como ausente, sino como no usado', async () => {
    const root = await raiz();
    const d = await diagnosticar(await config(root, { plantuml: false, mermaid: false, bpmn: false }));

    expect(requisito(d, 'Java').estado).toBe('no-usado');
    expect(requisito(d, 'plantuml.jar').estado).toBe('no-usado');
    expect(requisito(d, 'Chromium').estado).toBe('no-usado');
    // Que no se use no lo convierte en un problema del entorno.
    expect(requisito(d, 'Chromium').remedio).toBeUndefined();
  });
});

describe('que se puede dibujar', () => {
  it('con el entorno completo, ningun tipo se degrada', async () => {
    const root = await raiz();
    const jar = path.join(root, 'plantuml.jar');
    await writeFile(jar, 'x', 'utf8');
    navegadorSimulado = '/ruta/al/chrome';

    const d = await diagnosticar(await config(root, { java: await javaDeMentira(root), jar }));

    expect(d.ok).toBe(true);
    expect(d.imposibles).toEqual([]);
    expect(d.degradados).toEqual([]);
    expect(d.motoresAusentes).toEqual([]);
    expect(d.motoresDisponibles).toContain('plantuml');
    expect(d.motoresDisponibles).toContain('mermaid');
  });

  it('sin Java, lo que tiene respaldo se degrada y lo que no, se cae', async () => {
    const root = await raiz();
    navegadorSimulado = '/ruta/al/chrome';

    const d = await diagnosticar(await config(root, { java: path.join(root, 'no-existe') }));

    expect(d.ok).toBe(false);
    expect(d.motoresAusentes).toContain('plantuml');
    // `erd` tiene respaldo en mermaid; `sequence` depende de PlantUML.
    expect(tipo(d.degradados, 'erd')).toMatchObject({ motorPreferido: 'plantuml', motorEfectivo: 'mermaid' });
    expect(tipo(d.imposibles, 'sequence')).toMatchObject({ motorPreferido: 'plantuml' });
    expect(tipo(d.imposibles, 'sequence')!.motorEfectivo).toBeUndefined();
    // Lo que no depende de PlantUML sigue intacto.
    expect(tipo(d.intactos, 'strategy-tree')).toMatchObject({ motorEfectivo: 'd2' });
  });

  it('sin navegador, el flujo cae a d2 y BPMN se queda sin motor', async () => {
    const root = await raiz();
    const jar = path.join(root, 'plantuml.jar');
    await writeFile(jar, 'x', 'utf8');
    navegadorSimulado = undefined;

    const d = await diagnosticar(await config(root, { java: await javaDeMentira(root), jar }));

    expect(d.motoresAusentes).toContain('mermaid');
    expect(tipo(d.degradados, 'flow')).toMatchObject({ motorPreferido: 'mermaid', motorEfectivo: 'd2' });
    expect(tipo(d.imposibles, 'bpmn')).toBeDefined();
    expect(d.ok).toBe(false);
  });

  it('un motor deshabilitado no cuenta como disponible', async () => {
    const root = await raiz();
    navegadorSimulado = '/ruta/al/chrome';
    const d = await diagnosticar(await config(root, { plantuml: false, java: path.join(root, 'x') }));

    expect(d.motoresDisponibles).not.toContain('plantuml');
    expect(d.motoresAusentes).not.toContain('plantuml');
  });
});

describe('informe legible', () => {
  it('lista los remedios y agrupa por motor lo que no se puede dibujar', async () => {
    const root = await raiz();
    navegadorSimulado = undefined;
    const texto = formatearDiagnostico(await diagnosticar(await config(root, { java: path.join(root, 'x') })));

    expect(texto).toContain('FALTA');
    expect(texto).toContain('-> instala un JRE');
    expect(texto).toContain('no usables:');
    expect(texto).toContain('usaran su respaldo:');
    expect(texto).toContain('no se pueden dibujar:');
    expect(texto).toContain('plantuml: ');
    expect(texto).toContain('Falta algo del entorno');
  });

  it('con el entorno completo lo dice en una linea y no inventa secciones', async () => {
    const root = await raiz();
    const jar = path.join(root, 'plantuml.jar');
    await writeFile(jar, 'x', 'utf8');
    navegadorSimulado = '/ruta/al/chrome';

    const texto = formatearDiagnostico(await diagnosticar(await config(root, { java: await javaDeMentira(root), jar })));

    expect(texto).toContain('Todo el catalogo se puede dibujar.');
    expect(texto).not.toContain('usaran su respaldo:');
    expect(texto).not.toContain('no se pueden dibujar:');
    expect(texto).not.toContain('no usables:');
  });

  it('sin ningun motor disponible lo dice explicitamente', () => {
    const texto = formatearDiagnostico({
      requisitos: [{ nombre: 'Node.js', estado: 'ok', detalle: 'v20' }],
      motoresDisponibles: [],
      motoresAusentes: [],
      intactos: [],
      degradados: [],
      imposibles: [],
      ok: true,
    });
    expect(texto).toContain('disponibles: ninguno');
  });
});
