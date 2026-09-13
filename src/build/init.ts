/**
 * Preparacion de un proyecto para usar DocViz.
 *
 * Adoptarlo a mano son cuatro archivos y cinco scripts, y el que se olvida
 * siempre es `AGENTS.md`, justo el que hace que un agente escriba bien los
 * bloques. Este comando deja el proyecto listo y no sobrescribe nada que ya
 * exista: informa y sigue.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface InitOptions {
  /** Raiz del proyecto donde se escribe. */
  cwd: string;
  /** Tema inicial. */
  theme: string;
  /** Sobrescribe los archivos que ya existan. */
  force: boolean;
}

export interface InitResult {
  creados: string[];
  omitidos: string[];
  /** Scripts que habria que anadir a package.json, si falta alguno. */
  scriptsPendientes: Array<[string, string]>;
}

/** Scripts que forman el flujo de trabajo documentado. */
export const SCRIPTS: ReadonlyArray<readonly [string, string]> = [
  ['docs:check', 'docviz check docs-src'],
  ['docs:build', 'docviz build docs-src --output docs'],
  ['docs:verify', 'docviz verify docs'],
  ['docs:preview', 'docviz preview docs'],
  ['docs:doctor', 'docviz doctor'],
];

function configYaml(theme: string): string {
  return `# Configuracion de DocViz Builder.
#
# Todos los valores son opcionales: sin este archivo el build ya funciona en
# modo local, sin conexion y con el tema "default".

source: docs-src

output:
  dir: docs
  assetsDir: assets/generated

theme:
  name: ${theme}

cache:
  enabled: true
  dir: .docviz-cache

renderers:
  # "local" no envia nada a la red. "kroki" requiere una instancia propia.
  backend: local
  timeoutMs: 60000

  # Mermaid y BPMN dibujan dentro de un Chromium local y el sandbox esta activo.
  # Se desactiva solo como root, donde Chromium no arranca de otra forma.
  # noSandbox: false

  # Ejecuta \`docviz doctor\` para ver que motores puede usar esta maquina y que
  # tipos quedarian afectados si falta alguno.
`;
}

function agentsMd(): string {
  return `# Instrucciones para agentes — Documentación visual

Este proyecto usa **DocViz Builder** para generar diagramas dentro de Markdown.

## Regla principal

Modifica exclusivamente los documentos de \`docs-src/\`.

No edites nunca a mano \`docs/\` ni \`docs/assets/generated/\`: son directorios
generados y cualquier cambio se pierde en la siguiente compilación.

## Describe la intención, no la tecnología

DocViz elige el motor. Tú declaras qué quieres explicar con una de estas vallas:

| Valla | Cuándo |
|---|---|
| \`diagram\` | Interacción, flujo, estados, dependencias, análisis estratégico |
| \`chart\` | Comparación cuantitativa, tendencia, distribución |
| \`architecture\` | Modelo C4 |

Para saber qué tipo usar:

\`\`\`bash
npx docviz suggest "el proceso de aprobación de una solicitud"
npx docviz types              # catálogo completo con propósito y ejemplo
npx docviz types sequence     # ficha de un tipo concreto
\`\`\`

Si tu cliente tiene el servidor MCP de DocViz configurado, usa \`docviz_suggest\`
y \`docviz_types\` en lugar de los comandos.

## Ejemplo

\`\`\`\`md
\`\`\`diagram
type: sequence
title: Autenticación de usuario

participants:
  - Usuario
  - API

flow:
  - Usuario -> API: Login
  - API --> Usuario: Token
\`\`\`
\`\`\`\`

\`->\` es un mensaje; \`-->\` una respuesta.

## Flujo obligatorio

Después de crear o modificar documentación:

\`\`\`bash
npm run docs:check     # valida los bloques sin dibujar
npm run docs:build     # docs-src/ -> docs/
npm run docs:verify    # comprueba que no haya imágenes rotas
npm run docs:preview   # revisión visual
\`\`\`

No reportes la tarea como terminada mientras existan errores de renderizado o
imágenes rotas.

Cada error trae un **código** además de archivo y línea: \`DV101\` falta un campo
obligatorio, \`DV104\` escribiste un campo que ese tipo no usa, \`DV105\` el bloque
no es YAML válido, \`DV106\` el tipo no existe o va en otra valla. Un documento
con varios bloques rotos los reporta todos a la vez: arréglalos en una pasada.

Un \`AVISO ... [DV104]\` no rompe el build, pero significa que un campo que
escribiste no llegó al dibujo. O sobra, o está mal escrito; en ningún caso se
ignora.

Antes de dar por bueno un cambio grande, comprueba qué diagramas tocaste:

\`\`\`bash
npx docviz diff <docs-src de la versión anterior> docs-src
\`\`\`

## Reglas

- No generes SVG o PNG a mano cuando DocViz pueda generarlos.
- No modifiques hashes ni nombres de imagen.
- No introduzcas rutas absolutas.
- No sustituyas diagramas declarativos por capturas de pantalla.
- No fijes colores a mano: el tema trae su equivalente en modo oscuro, y un
  color escrito a mano pierde esa propiedad.

## Cuándo NO dibujar

Antes de crear una visualización, comprueba que aporta algo. Para información
sencilla, una tabla Markdown o un párrafo comunican mejor. Un diagrama con veinte
cajas no explica nada: divídelo en varios con objetivos distintos.
`;
}

function documentoDeEjemplo(): string {
  return `---
title: Arquitectura
---

# Arquitectura

Sustituye este documento por el tuyo. Sirve para comprobar que la compilación
funciona de extremo a extremo.

## Flujo de autenticación

\`\`\`diagram
type: sequence
title: Flujo de autenticación

participants:
  - Usuario
  - Frontend
  - API

flow:
  - Usuario -> Frontend: Login
  - Frontend -> API: POST /login
  - API --> Frontend: Token
\`\`\`

## Contexto del sistema

\`\`\`architecture
type: c4-context
title: Contexto

elements:
  - id: usuario
    kind: person
    name: Usuario
  - id: sistema
    kind: system
    name: Sistema
    description: Sustituye esto por tu sistema

relations:
  - from: usuario
    to: sistema
    label: Utiliza
\`\`\`
`;
}

const GITIGNORE = `
# DocViz: cache de recursos generados, se reconstruye solo.
.docviz-cache/
`;

export async function init(options: InitOptions): Promise<InitResult> {
  const { cwd, theme, force } = options;
  const result: InitResult = { creados: [], omitidos: [], scriptsPendientes: [] };

  const escribir = async (relativo: string, contenido: string): Promise<void> => {
    const destino = path.join(cwd, relativo);
    if (existsSync(destino) && !force) {
      result.omitidos.push(relativo);
      return;
    }
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, contenido, 'utf8');
    result.creados.push(relativo);
  };

  await escribir('docviz.config.yaml', configYaml(theme));
  await escribir('AGENTS.md', agentsMd());
  await escribir(path.join('docs-src', 'arquitectura.md'), documentoDeEjemplo());

  // El `.gitignore` se completa en lugar de sustituirse: casi siempre ya existe
  // y tiene contenido que no es nuestro.
  const gitignore = path.join(cwd, '.gitignore');
  if (existsSync(gitignore)) {
    const actual = await readFile(gitignore, 'utf8');
    if (!actual.includes('.docviz-cache')) {
      await writeFile(gitignore, `${actual.replace(/\s*$/, '')}\n${GITIGNORE}`, 'utf8');
      result.creados.push('.gitignore (ampliado)');
    } else {
      result.omitidos.push('.gitignore');
    }
  } else {
    await escribir('.gitignore', GITIGNORE.trimStart());
  }

  // Los scripts no se escriben solos: modificar el package.json de otro
  // proyecto es intrusivo. Se informa de cuales faltan.
  const packageJson = path.join(cwd, 'package.json');
  if (existsSync(packageJson)) {
    const contenido = JSON.parse(await readFile(packageJson, 'utf8')) as { scripts?: Record<string, string> };
    const scripts = contenido.scripts ?? {};
    for (const [nombre, comando] of SCRIPTS) {
      if (scripts[nombre] === undefined) result.scriptsPendientes.push([nombre, comando]);
    }
  } else {
    result.scriptsPendientes.push(...SCRIPTS.map((s) => [s[0], s[1]] as [string, string]));
  }

  return result;
}

/** Informe legible de lo que hizo `init`. */
export function formatearInit(result: InitResult, theme: string): string {
  const lineas: string[] = [''];

  if (result.creados.length > 0) {
    lineas.push('Creados:');
    for (const archivo of result.creados) lineas.push(`  + ${archivo}`);
    lineas.push('');
  }
  if (result.omitidos.length > 0) {
    lineas.push('Ya existian, no se tocaron:');
    for (const archivo of result.omitidos) lineas.push(`  = ${archivo}`);
    lineas.push('  (usa --force para sobrescribirlos)', '');
  }
  if (result.scriptsPendientes.length > 0) {
    lineas.push('Anade estos scripts a tu package.json:', '');
    lineas.push('  "scripts": {');
    lineas.push(
      result.scriptsPendientes.map(([nombre, comando]) => `    "${nombre}": "${comando}"`).join(',\n'),
    );
    lineas.push('  }', '');
  }

  lineas.push(
    `Tema: ${theme}`,
    '',
    'Siguientes pasos:',
    '  npx docviz doctor    comprueba que motores puede usar esta maquina',
    '  npx docviz build docs-src --output docs',
    '  npx docviz preview docs',
    '',
  );
  return lineas.join('\n');
}
