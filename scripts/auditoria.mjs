#!/usr/bin/env node
/**
 * auditoria.mjs — `npm audit` con excepciones que caducan.
 *
 * `npm audit --audit-level=X` es todo o nada: o bloquea por cualquier aviso de
 * ese nivel, o no bloquea. Cuando aparece uno sin correccion publicada —el
 * paquete afectado no tiene version arreglada todavia— quedan dos malas
 * salidas: bajar el nivel, que esconde tambien los que SI se podrian arreglar,
 * o quitar el paso, que es peor.
 *
 * Aqui se acepta un aviso concreto, con su motivo escrito y una FECHA DE
 * REVISION. Pasada esa fecha la excepcion deja de valer y la comprobacion
 * vuelve a fallar: una excepcion sin caducidad se convierte en permanente, y
 * entonces el paso no comprueba nada.
 *
 *   node scripts/auditoria.mjs
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NIVELES = ['moderate', 'high', 'critical'];

/** `npm audit` sale con codigo 1 cuando encuentra algo: eso no es un fallo. */
function auditar() {
  try {
    return execSync('npm audit --omit=dev --json', {
      cwd: raiz,
      maxBuffer: 1e9,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
  } catch (err) {
    const salida = err?.stdout?.toString() ?? '';
    if (salida.trim() === '') throw err;
    return salida;
  }
}

const aceptadas = JSON.parse(readFileSync(path.join(raiz, 'auditoria-aceptada.json'), 'utf8'));
const hoy = new Date().toISOString().slice(0, 10);

const informe = JSON.parse(auditar());
const problemas = [];
const caducadas = [];
let aceptados = 0;

for (const [paquete, dato] of Object.entries(informe.vulnerabilities ?? {})) {
  if (!NIVELES.includes(dato.severity)) continue;
  // Los avisos llegan como objetos con `url`, o como referencias a otro
  // paquete cuando la vulnerabilidad es heredada.
  const avisos = (dato.via ?? []).filter((v) => typeof v === 'object');
  if (avisos.length === 0) continue;

  for (const aviso of avisos) {
    const id = /GHSA-[\w-]+/.exec(aviso.url ?? '')?.[0] ?? aviso.url ?? aviso.title;
    const excepcion = aceptadas.avisos.find((a) => a.aviso === id);
    if (excepcion === undefined) {
      problemas.push(`${paquete} · ${dato.severity} · ${id} · ${aviso.title ?? ''}`);
    } else if (excepcion.revisar_el < hoy) {
      caducadas.push(`${paquete} · ${id} · habia que revisarlo el ${excepcion.revisar_el}`);
    } else {
      aceptados += 1;
    }
  }
}

if (caducadas.length > 0) {
  process.stderr.write(`\n${caducadas.length} excepcion(es) de auditoria caducada(s):\n`);
  for (const c of caducadas) process.stderr.write(`  ${c}\n`);
  process.stderr.write(
    '\nComprueba si ya hay correccion publicada. Si la hay, actualiza; si no,\n' +
      'mueve la fecha a conciencia en auditoria-aceptada.json.\n',
  );
}
if (problemas.length > 0) {
  process.stderr.write(`\n${problemas.length} vulnerabilidad(es) sin aceptar en produccion:\n`);
  for (const p of problemas) process.stderr.write(`  ${p}\n`);
}
if (problemas.length > 0 || caducadas.length > 0) process.exit(1);

process.stdout.write(
  `auditoria de produccion limpia${aceptados > 0 ? ` (${aceptados} aviso(s) aceptado(s) con fecha de revision)` : ''}\n`,
);
