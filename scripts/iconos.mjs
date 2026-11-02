#!/usr/bin/env node
/**
 * iconos.mjs — trae logos oficiales a `vendor/icons`.
 *
 * Los logos de marca NO viajan en el paquete, y no es una decision estetica.
 * La licencia de una coleccion de logos resuelve el copyright del archivo, no
 * el uso de la marca: el propio texto de CC0 dice que «no trademark or patent
 * rights held by Affirmer are waived» y que quien dona no responde de los
 * derechos de terceros. AWS permite expresamente sus iconos en diagramas y no
 * dice nada de redistribuirlos; Azure los limita al «permitted use». Asi que
 * se traen a peticion, como `docviz setup` trae el jar de PlantUML, y no se
 * suben al repositorio ni al paquete publicado.
 *
 * Lo que si viaja es `assets/icons`: pictogramas genericos de Lucide, bajo ISC
 * —una licencia que si permite redistribuir— y que no son la marca de nadie.
 *
 * Formas de pedir un icono:
 *   nombre              el nombre es tambien la clave de busqueda
 *   nombre:clave        nombre distinto de la clave  (betterauth:better-auth)
 *   nombre=URL          archivo concreto             (orpc=https://.../logo.svg)
 *   nombre:lucide/icono pictograma generico          (cron:lucide/clock)
 *
 * Orden de fuentes: svgl -> devicon -> gilbarbara/logos.
 *
 * `simple-icons` queda fuera a proposito: sus glifos son redibujos
 * monocromos, no la marca oficial, y se nota a simple vista.
 *
 *   node scripts/iconos.mjs react postgresql "betterauth:better-auth"
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const destino = path.join(process.cwd(), 'vendor', 'icons');
const UA = { 'User-Agent': 'docviz-builder/iconos' };
const NOMBRE_RE = /^[a-z0-9][a-z0-9_-]*$/;

/** Normaliza un titulo para comparar sin depender de puntos ni mayusculas. */
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

async function traer(url) {
  const res = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const esSvg = (b) => b.subarray(0, 300).toString('utf8').trimStart().startsWith('<svg')
  || b.subarray(0, 300).toString('utf8').trimStart().startsWith('<?xml');

/**
 * svgl, por igualdad exacta del titulo normalizado.
 *
 * Su busqueda es difusa: `nextjs` encuentra «Next.js» pero tambien cosas que
 * no son. Un acierto aproximado enviaria el logo de OTRA marca sin avisar, asi
 * que lo que no coincide exactamente cae a la fuente siguiente.
 */
async function svgl(clave) {
  const consultas = [clave, clave.replace(/[-_.]+/g, ' ').trim()];
  const objetivos = new Set([norm(clave)]);
  if (clave.length > 4 && clave.endsWith('js')) {
    consultas.push(clave.slice(0, -2));
    objetivos.add(norm(clave.slice(0, -2)));
  }
  for (const q of new Set(consultas)) {
    let items;
    try {
      items = JSON.parse((await traer(`https://api.svgl.app?search=${encodeURIComponent(q)}`)).toString('utf8'));
    } catch {
      continue;
    }
    for (const it of Array.isArray(items) ? items : []) {
      if (!objetivos.has(norm(it?.title ?? ''))) continue;
      const ruta = it.route;
      // Con variante clara y oscura se toma la clara: el nodo del diagrama
      // tiene fondo claro en los dos esquemas, igual que las teselas.
      const url = typeof ruta === 'string' ? ruta : (ruta?.light ?? ruta?.dark);
      if (typeof url === 'string') return { url, fuente: 'svgl' };
    }
  }
  return undefined;
}

const FUENTES = [
  svgl,
  async (clave) => ({
    url: `https://raw.githubusercontent.com/devicons/devicon/master/icons/${clave}/${clave}-original.svg`,
    fuente: 'devicon',
  }),
  async (clave) => ({
    url: `https://cdn.jsdelivr.net/gh/gilbarbara/logos/logos/${clave}-icon.svg`,
    fuente: 'gilbarbara/logos',
  }),
  async (clave) => ({
    url: `https://cdn.jsdelivr.net/gh/gilbarbara/logos/logos/${clave}.svg`,
    fuente: 'gilbarbara/logos',
  }),
];

/** Parte una peticion en nombre, clave y, si la hay, URL explicita. */
function parsear(spec) {
  const igual = spec.indexOf('=');
  if (igual > 0) return { nombre: spec.slice(0, igual), url: spec.slice(igual + 1) };
  const dosPuntos = spec.indexOf(':');
  if (dosPuntos > 0) {
    const nombre = spec.slice(0, dosPuntos);
    const resto = spec.slice(dosPuntos + 1);
    if (resto.startsWith('lucide/')) {
      return {
        nombre,
        url: `https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/${resto.slice(7)}.svg`,
        fuente: 'Lucide',
      };
    }
    return { nombre, clave: resto };
  }
  return { nombre: spec, clave: spec };
}

async function resolver(peticion) {
  if (peticion.url !== undefined) {
    return { bytes: await traer(peticion.url), url: peticion.url, fuente: peticion.fuente ?? 'url' };
  }
  for (const fuente of FUENTES) {
    let candidato;
    try {
      candidato = await fuente(peticion.clave);
    } catch {
      continue;
    }
    if (candidato === undefined) continue;
    try {
      const bytes = await traer(candidato.url);
      if (!esSvg(bytes)) continue;
      return { bytes, url: candidato.url, fuente: candidato.fuente };
    } catch {
      // esta fuente no lo tiene: se prueba la siguiente
    }
  }
  return undefined;
}

/**
 * Avisa de un logo que es blanco **entero**.
 *
 * Un relleno blanco suelto puede ser un detalle interior de una marca de
 * color, asi que solo se avisa cuando no hay ningun otro color: sobre el nodo
 * claro de un diagrama, ese sí desaparece.
 */
function todoBlanco(svg) {
  const pintadas = [...svg.matchAll(/(?:fill|stroke|stop-color)[=:]\s*"?([#a-zA-Z][^";\s>]*)/g)].map((m) => m[1].toLowerCase());
  let blanco = false;
  let color = false;
  for (const p of pintadas) {
    if (['none', 'transparent', 'currentcolor'].includes(p) || p.startsWith('url(')) continue;
    if (/^(#fff(fff)?|white)$/.test(p)) blanco = true;
    else color = true;
  }
  return blanco && !color;
}

async function main() {
  const specs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (specs.length === 0) {
    console.error('uso: docviz icons <nombre|nombre:clave|nombre=URL|nombre:lucide/icono> ...');
    console.error(`destino: ${path.relative(process.cwd(), destino) || 'vendor/icons'}`);
    process.exit(2);
  }

  await mkdir(destino, { recursive: true });
  let manifiesto = { version: 1, icons: {} };
  try {
    manifiesto = JSON.parse(await readFile(path.join(destino, 'manifest.json'), 'utf8'));
    manifiesto.icons ??= {};
  } catch {
    // primer uso
  }

  let fallos = 0;
  for (const spec of specs) {
    const peticion = parsear(spec);
    if (!NOMBRE_RE.test(peticion.nombre) || peticion.nombre.length > 64) {
      console.error(`  ${spec}: el nombre "${peticion.nombre}" no vale como nombre de archivo`);
      fallos += 1;
      continue;
    }
    const encontrado = await resolver(peticion);
    if (encontrado === undefined) {
      console.error(`  ${peticion.nombre}: no esta en svgl, devicon ni gilbarbara`);
      console.error('     pasa el archivo oficial a mano: ' + `${peticion.nombre}=https://.../logo.svg`);
      fallos += 1;
      continue;
    }
    const texto = encontrado.bytes.toString('utf8');
    await writeFile(path.join(destino, `${peticion.nombre}.svg`), texto, 'utf8');
    manifiesto.icons[peticion.nombre] = {
      file: `${peticion.nombre}.svg`,
      source: encontrado.fuente,
      url: encontrado.url,
      bytes: encontrado.bytes.length,
      ...(todoBlanco(texto) ? { whiteFill: true } : {}),
    };
    const aviso = todoBlanco(texto) ? '  (BLANCO ENTERO: se perdera sobre fondo claro)' : '';
    console.log(`  ${peticion.nombre}: ${encontrado.fuente}, ${encontrado.bytes.length} B${aviso}`);
  }

  await writeFile(
    path.join(destino, 'manifest.json'),
    `${JSON.stringify(manifiesto, null, 2)}\n`,
    'utf8',
  );

  const total = Object.keys(manifiesto.icons).length;
  console.log(`\n${total} icono(s) en ${path.relative(process.cwd(), destino) || 'vendor/icons'}`);
  console.log(
    'Las marcas siguen siendo de sus titulares. No subas vendor/icons al repositorio:\n' +
      'la licencia de la coleccion cubre el archivo, no el uso de la marca.',
  );
  if (fallos > 0) process.exit(1);
}

await main();
