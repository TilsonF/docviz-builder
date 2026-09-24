/**
 * Diagnostico del entorno.
 *
 * Con el sistema de respaldos, "esta instalado" dejo de ser una respuesta de si
 * o no: sin Java hay tipos que se dibujan igual con otro motor, otros que se
 * degradan y otros que no se pueden dibujar. Este comando dice exactamente cual
 * es cual, en lugar de dejar que se descubra cuando falla un build.
 */

import { access, constants } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { TYPE_CATALOG } from '../dsl/index.js';
import { compilerEngines } from '../dsl/compile.js';
import { buildRegistry } from '../renderers/index.js';
import { findBrowser } from '../renderers/browser.js';
import { resolveJarPath } from '../renderers/plantuml.js';
import { paqueteDisponible, packageVersion } from '../core/package-version.js';
import { resolveFromRoot } from '../config/load.js';
import type { DocVizConfig } from '../config/types.js';

const run = promisify(execFile);

export type Estado = 'ok' | 'ausente' | 'no-usado';

export interface Requisito {
  nombre: string;
  estado: Estado;
  detalle: string;
  /** Que hacer si falta. */
  remedio?: string;
}

export interface DiagnosticoTipo {
  tipo: string;
  motorPreferido: string;
  /** Motor que se usaria ahora mismo, o `undefined` si ninguno esta disponible. */
  motorEfectivo?: string;
}

export interface Diagnostico {
  requisitos: Requisito[];
  motoresDisponibles: string[];
  motoresAusentes: string[];
  /** Tipos que se dibujarian con su motor preferido. */
  intactos: DiagnosticoTipo[];
  /** Tipos que caerian a un respaldo: se dibujan, con otro aspecto. */
  degradados: DiagnosticoTipo[];
  /** Tipos que hoy no se pueden dibujar. */
  imposibles: DiagnosticoTipo[];
  ok: boolean;
}

async function existe(ruta: string): Promise<boolean> {
  try {
    await access(ruta, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function versionDeJava(ejecutable: string): Promise<string | undefined> {
  try {
    // Java escribe su version en stderr, no en stdout.
    const { stderr } = await run(ejecutable, ['-version'], { timeout: 20_000 });
    return stderr.split('\n')[0]?.trim();
  } catch {
    return undefined;
  }
}

export async function diagnosticar(config: DocVizConfig): Promise<Diagnostico> {
  const requisitos: Requisito[] = [];
  const r = config.renderers;

  requisitos.push({
    nombre: 'Node.js',
    estado: 'ok',
    detalle: process.version,
  });

  // --- Java y PlantUML ---
  const java = r.plantuml.java ?? process.env['DOCVIZ_JAVA'] ?? 'java';
  const versionJava = r.plantuml.enabled ? await versionDeJava(java) : undefined;
  if (!r.plantuml.enabled) {
    requisitos.push({ nombre: 'Java', estado: 'no-usado', detalle: 'PlantUML esta deshabilitado' });
  } else if (versionJava !== undefined) {
    requisitos.push({ nombre: 'Java', estado: 'ok', detalle: versionJava });
  } else {
    requisitos.push({
      nombre: 'Java',
      estado: 'ausente',
      detalle: `no se pudo ejecutar "${java}"`,
      remedio: 'instala un JRE 8 o superior, o define renderers.plantuml.java',
    });
  }

  // La ruta tiene que ser la misma que usara el renderer. Resolverla aqui
  // contra la raiz del proyecto daba un falso negativo en todo proyecto que
  // instale DocViz: el jar viaja dentro del paquete, no del proyecto.
  const jar =
    r.plantuml.jar !== undefined ? resolveFromRoot(config, r.plantuml.jar) : resolveJarPath();
  if (!r.plantuml.enabled) {
    requisitos.push({ nombre: 'plantuml.jar', estado: 'no-usado', detalle: 'PlantUML esta deshabilitado' });
  } else if (await existe(jar)) {
    requisitos.push({ nombre: 'plantuml.jar', estado: 'ok', detalle: jar });
  } else {
    requisitos.push({
      nombre: 'plantuml.jar',
      estado: 'ausente',
      detalle: `no esta en ${jar}`,
      remedio: 'ejecuta `npx docviz setup`, o define renderers.plantuml.jar',
    });
  }

  // --- Navegador ---
  const necesitaNavegador = r.mermaid.enabled || r.bpmn.enabled;
  const navegador = findBrowser(r.mermaid.browserPath ?? r.bpmn.browserPath);
  if (!necesitaNavegador) {
    requisitos.push({
      nombre: 'Chromium',
      estado: 'no-usado',
      detalle: 'Mermaid y BPMN estan deshabilitados',
    });
  } else if (navegador !== undefined) {
    requisitos.push({ nombre: 'Chromium', estado: 'ok', detalle: navegador });
  } else {
    requisitos.push({
      nombre: 'Chromium',
      estado: 'ausente',
      detalle: 'no se encontro ningun navegador',
      remedio: 'instala Google Chrome, exporta DOCVIZ_BROWSER_PATH o ejecuta `npx playwright install chromium`',
    });
  }

  // --- El paquete de LikeC4 ---
  // Va aqui, con Java y Chromium, porque es lo mismo: algo que DocViz necesita
  // y no trae consigo. La diferencia es que este NO se nota al arrancar, sino
  // en mitad del render, asi que si no se comprueba aqui no se comprueba nunca.
  if (!r.likec4.enabled) {
    requisitos.push({ nombre: 'paquete likec4', estado: 'no-usado', detalle: 'LikeC4 esta deshabilitado' });
  } else if (paqueteDisponible('likec4')) {
    requisitos.push({ nombre: 'paquete likec4', estado: 'ok', detalle: packageVersion('likec4') });
  } else {
    requisitos.push({
      nombre: 'paquete likec4',
      estado: 'ausente',
      detalle: 'los tipos C4 se dibujaran con su respaldo plantuml-c4, con otro aspecto',
      remedio: 'npm install likec4',
    });
  }

  // --- Que motores quedan realmente utilizables ---
  const registry = buildRegistry(config);
  const registrados = new Set(registry.types());
  await registry.disposeAll().catch(() => undefined);

  const utilizable = (motor: string): boolean => {
    if (!registrados.has(motor)) return false;
    if (motor === 'plantuml' || motor === 'plantuml-c4') {
      return versionJava !== undefined && requisitos.some((q) => q.nombre === 'plantuml.jar' && q.estado === 'ok');
    }
    if (motor === 'mermaid' || motor === 'bpmn') return navegador !== undefined;
    return true;
  };

  const motoresDisponibles = [...registrados].filter(utilizable).sort();
  const motoresAusentes = [...registrados].filter((m) => !utilizable(m)).sort();

  const intactos: DiagnosticoTipo[] = [];
  const degradados: DiagnosticoTipo[] = [];
  const imposibles: DiagnosticoTipo[] = [];

  for (const spec of TYPE_CATALOG) {
    // Solo cuentan los respaldos que ademas tienen compilador propio.
    const conCompilador = compilerEngines(spec.type);
    const candidatos = [spec.engine, ...(spec.fallbacks ?? [])].filter(
      (m) => spec.lang === 'chart' || conCompilador.includes(m),
    );
    const efectivo = candidatos.find(utilizable);
    const entrada: DiagnosticoTipo = { tipo: spec.type, motorPreferido: spec.engine };
    if (efectivo !== undefined) entrada.motorEfectivo = efectivo;

    if (efectivo === undefined) imposibles.push(entrada);
    else if (efectivo === spec.engine) intactos.push(entrada);
    else degradados.push(entrada);
  }

  return {
    requisitos,
    motoresDisponibles,
    motoresAusentes,
    intactos,
    degradados,
    imposibles,
    ok: imposibles.length === 0,
  };
}

const SIMBOLO: Record<Estado, string> = {
  ok: 'ok  ',
  ausente: 'FALTA',
  'no-usado': '-   ',
};

/** Informe legible del diagnostico. */
export function formatearDiagnostico(d: Diagnostico): string {
  const lineas: string[] = ['', 'Entorno', ''];

  const ancho = Math.max(...d.requisitos.map((q) => q.nombre.length));
  for (const q of d.requisitos) {
    lineas.push(`  ${SIMBOLO[q.estado]}  ${q.nombre.padEnd(ancho)}  ${q.detalle}`);
    if (q.remedio !== undefined) lineas.push(`         ${' '.repeat(ancho)}  -> ${q.remedio}`);
  }

  lineas.push('', 'Motores', '');
  lineas.push(`  disponibles: ${d.motoresDisponibles.join(', ') || 'ninguno'}`);
  if (d.motoresAusentes.length > 0) lineas.push(`  no usables:  ${d.motoresAusentes.join(', ')}`);

  lineas.push('', 'Tipos', '');
  lineas.push(`  ${String(d.intactos.length).padStart(3)}  se dibujan con su motor preferido`);

  if (d.degradados.length > 0) {
    lineas.push(`  ${String(d.degradados.length).padStart(3)}  usaran su respaldo:`);
    for (const t of d.degradados) {
      lineas.push(`         ${t.tipo} (${t.motorPreferido} -> ${t.motorEfectivo})`);
    }
  }

  if (d.imposibles.length > 0) {
    lineas.push(`  ${String(d.imposibles.length).padStart(3)}  no se pueden dibujar:`);
    // Se agrupan por motor: la accion que los arregla es la misma para todos.
    const porMotor = new Map<string, string[]>();
    for (const t of d.imposibles) {
      const lista = porMotor.get(t.motorPreferido) ?? [];
      lista.push(t.tipo);
      porMotor.set(t.motorPreferido, lista);
    }
    for (const [motor, tipos] of porMotor) {
      lineas.push(`         ${motor}: ${tipos.join(', ')}`);
    }
  }

  lineas.push(
    '',
    d.ok
      ? 'Todo el catalogo se puede dibujar.'
      : 'Falta algo del entorno: los tipos de arriba fallarian al compilar.',
    '',
  );
  return lineas.join('\n');
}
