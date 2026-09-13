#!/usr/bin/env node
/**
 * Mide si DocViz se deja usar por un modelo de lenguaje.
 *
 * Es la metrica del producto y hasta ahora era una intuicion: el catalogo, los
 * mensajes de error y AGENTS.md existen para que un agente acierte, pero nadie
 * habia comprobado si acierta. Aqui se mide, sobre los mismos casos, en dos
 * modos:
 *
 *   node scripts/eval.mjs              catalogo (sin red, sin coste)
 *   node scripts/eval.mjs --modelo     con un modelo de verdad (gasta dinero)
 *
 * El modo **catalogo** pregunta a `docviz suggest` que tipo usaria para cada
 * necesidad. No usa un modelo, pero mide justo lo que un modelo lee para
 * decidir: los `keywords`, el `purpose` y el `whenToUse` del catalogo. Es
 * determinista, dura un segundo y por eso puede ser una compuerta de CI.
 *
 * El modo **modelo** es la medida real: se le entrega el mismo AGENTS.md que
 * recibiria en un proyecto, se le pide el bloque y se compila. Si falla, se le
 * devuelve el error tal cual —con su codigo y su errata senalada— y se le deja
 * reintentar. Lo que se mide entonces no es solo si acierta, sino si nuestros
 * mensajes de error le permiten recuperarse.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { compileDsl } from '../dist/dsl/index.js';
import { suggestType } from '../dist/mcp/tools.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opciones = {
  modelo: argv.includes('--modelo'),
  json: argv.includes('--json'),
  modeloId: valorDe('--modelo-id') ?? 'claude-opus-5',
  particion: valorDe('--particion'),
  reintentos: Number.parseInt(valorDe('--reintentos') ?? '2', 10),
  minimo: Number.parseFloat(valorDe('--minimo') ?? '0'),
  soloCaso: valorDe('--caso'),
};

function valorDe(bandera) {
  const i = argv.indexOf(bandera);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : undefined;
}

async function cargarCasos() {
  const todos = JSON.parse(await readFile(path.join(raiz, 'eval', 'casos.json'), 'utf8'));
  return todos.filter(
    (c) =>
      (opciones.soloCaso === undefined || c.id === opciones.soloCaso) &&
      (opciones.particion === undefined || (c.particion ?? 'entrenamiento') === opciones.particion),
  );
}

/** Tipos que se dan por buenos para un caso. */
const aceptados = (caso) => caso.acepta ?? [caso.tipo];

// --------------------------------------------------------------------------
// Modo catalogo
// --------------------------------------------------------------------------

async function evaluarCatalogo() {
  const casos = await cargarCasos();
  const filas = casos.map((caso) => {
    const resultado = suggestType({ need: caso.necesidad, limit: 3 });
    const propuestos = (resultado.matches ?? []).map((m) => m.type);
    const validos = aceptados(caso);
    return {
      id: caso.id,
      idioma: caso.idioma ?? 'es',
      particion: caso.particion ?? 'entrenamiento',
      esperado: caso.tipo,
      propuestos,
      top1: propuestos.length > 0 && validos.includes(propuestos[0]),
      top3: propuestos.some((t) => validos.includes(t)),
    };
  });

  const agrupar = (clave) => {
    const grupos = {};
    for (const f of filas) {
      const g = (grupos[f[clave]] ??= { casos: 0, top1: 0, top3: 0 });
      g.casos += 1;
      if (f.top1) g.top1 += 1;
      if (f.top3) g.top3 += 1;
    }
    return grupos;
  };
  const porIdioma = agrupar('idioma');
  const porParticion = agrupar('particion');

  return {
    modo: 'catalogo',
    casos: filas.length,
    top1: filas.filter((f) => f.top1).length,
    top3: filas.filter((f) => f.top3).length,
    porIdioma,
    porParticion,
    filas,
  };
}

// --------------------------------------------------------------------------
// Modo modelo
// --------------------------------------------------------------------------

const VALLAS = ['diagram', 'chart', 'architecture'];

/** Primer bloque de DocViz que aparezca en la respuesta. */
export function extraerBloque(texto) {
  const re = /```(diagram|chart|architecture)[^\n]*\n([\s\S]*?)```/;
  const m = re.exec(texto);
  return m === null ? undefined : { lang: m[1], source: m[2] };
}

const INSTRUCCIONES = [
  'Escribe UN solo bloque de DocViz que explique lo que se te pide.',
  'Responde unicamente con el bloque entre vallas, sin texto antes ni despues.',
  'Elige el tipo mas adecuado del catalogo que aparece en las instrucciones.',
].join(' ');

async function evaluarModelo() {
  const casos = await cargarCasos();
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const contrato = await readFile(path.join(raiz, 'AGENTS.md'), 'utf8');

  const filas = [];
  for (const caso of casos) {
    const fila = await resolverCaso(client, contrato, caso);
    filas.push(fila);
    if (!opciones.json) {
      const marca = fila.compilaFinal ? (fila.intentos === 1 ? 'ok ' : 'ok*') : 'NO ';
      process.stdout.write(
        `  ${marca} ${caso.id.padEnd(16)} ${String(fila.tipoUsado ?? '-').padEnd(16)} ${fila.intentos} intento(s)\n`,
      );
    }
  }

  return {
    modo: 'modelo',
    modeloId: opciones.modeloId,
    casos: filas.length,
    tipoCorrecto: filas.filter((f) => f.tipoCorrecto).length,
    compilaPrimera: filas.filter((f) => f.compilaPrimera).length,
    compilaFinal: filas.filter((f) => f.compilaFinal).length,
    intentosMedios: filas.reduce((a, f) => a + f.intentos, 0) / (filas.length || 1),
    filas,
  };
}

async function resolverCaso(client, contrato, caso) {
  const mensajes = [{ role: 'user', content: `${INSTRUCCIONES}\n\nNecesidad: ${caso.necesidad}` }];
  const fila = {
    id: caso.id,
    esperado: caso.tipo,
    intentos: 0,
    tipoUsado: undefined,
    tipoCorrecto: false,
    compilaPrimera: false,
    compilaFinal: false,
    errores: [],
  };

  for (let intento = 1; intento <= opciones.reintentos + 1; intento += 1) {
    fila.intentos = intento;
    const respuesta = await client.messages.create({
      model: opciones.modeloId,
      max_tokens: 16000,
      system: [{ type: 'text', text: contrato, cache_control: { type: 'ephemeral' } }],
      messages: mensajes,
    });

    const texto = respuesta.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const bloque = extraerBloque(texto);

    if (bloque === undefined) {
      fila.errores.push('la respuesta no contenia ningun bloque de DocViz');
      mensajes.push({ role: 'assistant', content: texto });
      mensajes.push({
        role: 'user',
        content: `No encuentro ningun bloque entre vallas \`\`\`${VALLAS.join('/')}\`\`\`. Devuelve solo el bloque.`,
      });
      continue;
    }

    // El tipo se anota aunque el bloque no compile: acertar el tipo y
    // equivocarse en un campo son dos fallos distintos y se corrigen distinto.
    const declarado = /^\s*type:\s*(\S+)/m.exec(bloque.source);
    fila.tipoUsado = declarado?.[1] ?? (bloque.lang === 'architecture' ? 'c4-context' : undefined);
    fila.tipoCorrecto = fila.tipoUsado !== undefined && aceptados(caso).includes(fila.tipoUsado);

    try {
      compileDsl(bloque.lang, bloque.source);
      fila.compilaFinal = true;
      if (intento === 1) fila.compilaPrimera = true;
      return fila;
    } catch (err) {
      // Aqui se mide de verdad la calidad del reporte: se le devuelve el error
      // tal cual lo veria en su terminal, sin ayuda anadida.
      const reporte = typeof err.format === 'function' ? err.format() : String(err.message ?? err);
      fila.errores.push(reporte);
      mensajes.push({ role: 'assistant', content: texto });
      mensajes.push({ role: 'user', content: `El bloque no compila:\n\n${reporte}\n\nDevuelve el bloque corregido.` });
    }
  }

  return fila;
}

// --------------------------------------------------------------------------

/**
 * El cuerpo solo corre si se invoca el script directamente.
 *
 * Sin esta guarda, importar el modulo para probar una de sus funciones
 * ejecutaria el eval entero como efecto secundario.
 */
const invocadoDirectamente =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invocadoDirectamente) await main();

async function main() {
const resultado = opciones.modelo ? await evaluarModelo() : await evaluarCatalogo();

if (opciones.json) {
  process.stdout.write(`${JSON.stringify(resultado, null, 2)}\n`);
} else if (resultado.modo === 'catalogo') {
  for (const f of resultado.filas) {
    if (f.top1) continue;
    process.stdout.write(
      `  ${(f.top3 ? 'top3' : 'FALLA').padEnd(5)} ${f.id.padEnd(16)} esperaba ${f.esperado.padEnd(16)} propuso ${f.propuestos.join(', ') || '(nada)'}\n`,
    );
  }
  const pct = (n, total) => ((n / total) * 100).toFixed(1);
  process.stdout.write(
    `\ncatalogo: ${resultado.casos} casos\n` +
      `  acierto en la primera propuesta: ${resultado.top1}/${resultado.casos}  (${pct(resultado.top1, resultado.casos)} %)\n` +
      `  acierto entre las tres primeras: ${resultado.top3}/${resultado.casos}  (${pct(resultado.top3, resultado.casos)} %)\n`,
  );
  // El desglose por idioma no es decorativo: el catalogo se escribio en
  // español y las palabras en ingles se anadieron despues, asi que la unica
  // forma de saber si sirven de algo es medirlas por separado.
  for (const [idioma, d] of Object.entries(resultado.porIdioma).sort()) {
    process.stdout.write(
      `    ${idioma}: ${d.casos} casos  ->  ${pct(d.top1, d.casos)} % / ${pct(d.top3, d.casos)} %\n`,
    );
  }
  // La particion reservada es la unica cifra que se puede citar: los casos de
  // entrenamiento se han mirado al ajustar la puntuacion, y lo que se ajusta
  // mirando deja de medir.
  process.stdout.write('\n');
  for (const [particion, d] of Object.entries(resultado.porParticion).sort()) {
    process.stdout.write(
      `    ${particion.padEnd(14)} ${String(d.casos).padStart(2)} casos  ->  ${pct(d.top1, d.casos)} % / ${pct(d.top3, d.casos)} %\n`,
    );
  }
} else {
  const pct = (n) => ((n / resultado.casos) * 100).toFixed(1);
  process.stdout.write(
    `\nmodelo ${resultado.modeloId}: ${resultado.casos} casos\n` +
      `  tipo correcto:        ${resultado.tipoCorrecto}/${resultado.casos}  (${pct(resultado.tipoCorrecto)} %)\n` +
      `  compila a la primera: ${resultado.compilaPrimera}/${resultado.casos}  (${pct(resultado.compilaPrimera)} %)\n` +
      `  compila al final:     ${resultado.compilaFinal}/${resultado.casos}  (${pct(resultado.compilaFinal)} %)\n` +
      `  intentos de media:    ${resultado.intentosMedios.toFixed(2)}\n`,
  );
}

// La compuerta mide el acierto entre las tres primeras: un agente ve las tres.
const medida = resultado.modo === 'catalogo' ? resultado.top3 / resultado.casos : resultado.compilaFinal / resultado.casos;
if (opciones.minimo > 0 && medida < opciones.minimo) {
  process.stderr.write(
    `\nla medida (${(medida * 100).toFixed(1)} %) esta por debajo del minimo exigido (${(opciones.minimo * 100).toFixed(1)} %)\n`,
  );
  process.exit(1);
}
}
