/**
 * Instalacion del contrato de DocViz como skill de agente.
 *
 * `docviz init` deja un `AGENTS.md` en el proyecto, y eso basta para los
 * agentes que lo leen solos. Pero un agente solo abre `AGENTS.md` si ya esta
 * trabajando en ese repositorio: no hay forma de que sepa que DocViz existe
 * antes de eso. Un skill instalado —en el proyecto o en el perfil del usuario—
 * lo pone en su radar desde el primer mensaje.
 */

import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DocVizError, ERROR_CODES } from '../core/errors.js';

export interface SkillOptions {
  /** Raiz del proyecto, para la instalacion local. */
  cwd: string;
  /** Instala en el perfil del usuario en lugar de en el proyecto. */
  global?: boolean;
  /** Directorio de skills de otro agente, si no es el de Claude Code. */
  dir?: string;
  /** Sobrescribe una instalacion anterior. */
  force?: boolean;
}

export interface SkillResult {
  destino: string;
  escrito: boolean;
  /** Por que no se escribio, si no se escribio. */
  motivo?: string;
}

/** Fuente del skill dentro del propio paquete. */
export function skillSourcePath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/build/skill.js -> raiz del paquete
  return path.resolve(here, '..', '..', 'skills', 'docviz', 'SKILL.md');
}

/**
 * Directorio donde el agente busca sus skills.
 *
 * Se admite `dir` explicito porque cada agente elige el suyo y esa lista
 * cambia mas rapido que este paquete: fijarla aqui garantizaria quedarse
 * desactualizado.
 */
export function skillTargetDir(options: SkillOptions): string {
  if (options.dir !== undefined) return path.resolve(options.cwd, options.dir);
  const base = options.global === true ? homedir() : options.cwd;
  return path.join(base, '.claude', 'skills');
}

export async function installSkill(options: SkillOptions): Promise<SkillResult> {
  const origen = skillSourcePath();
  if (!existsSync(origen)) {
    throw new DocVizError(
      'el paquete no incluye el skill',
      {},
      `se esperaba en ${origen}`,
      ERROR_CODES.CONFIG,
    );
  }

  const destino = path.join(skillTargetDir(options), 'docviz', 'SKILL.md');
  if (existsSync(destino) && options.force !== true) {
    return { destino, escrito: false, motivo: 'ya existe' };
  }

  await mkdir(path.dirname(destino), { recursive: true });
  await copyFile(origen, destino);
  return { destino, escrito: true };
}

/** Informe legible de la instalacion. */
export function formatearSkill(result: SkillResult): string {
  if (!result.escrito) {
    return (
      `\nel skill ya estaba instalado en ${result.destino}\n` +
      '  (usa --force para sobrescribirlo)\n\n'
    );
  }
  return (
    `\nskill instalado en ${result.destino}\n\n` +
    'A partir de ahora tu agente sabe que DocViz existe y como usarlo.\n' +
    'Para el catalogo completo de los 57 tipos, ejecuta `docviz init` en el\n' +
    'proyecto: deja un AGENTS.md con las tablas de decision.\n\n'
  );
}

/** Contenido del skill, para comprobar que sigue siendo valido. */
export async function readSkill(): Promise<string> {
  return readFile(skillSourcePath(), 'utf8');
}
