/**
 * Servidor MCP de DocViz.
 *
 * Expone la compilacion de diagramas como herramientas, de modo que un agente
 * no tenga que ejecutar comandos de shell ni conocer los motores:
 *
 *   docviz_types              catalogo de tipos y temas
 *   docviz_validate_document  valida bloques sin renderizar
 *   docviz_render_diagram     renderiza un diagrama suelto
 *   docviz_build_document     compila docs-src -> docs
 *   docviz_preview            devuelve el Markdown compilado y sus incidencias
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  buildDocuments,
  listTypes,
  previewDocument,
  renderDiagram,
  renderableTypes,
  validateDocument,
  type ToolResult,
} from './tools.js';
import { themeNames } from '../themes/index.js';

function asContent(result: ToolResult): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  const payload = { type: 'text' as const, text: JSON.stringify(result, null, 2) };
  return result.ok ? { content: [payload] } : { content: [payload], isError: true };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'docviz', version: '0.1.0' });

  server.registerTool(
    'docviz_types',
    {
      title: 'Tipos de visualizacion disponibles',
      description:
        'Lista los tipos que admite el DSL de DocViz (diagram, chart, architecture) y los temas del proyecto. ' +
        'Consultalo antes de escribir un bloque si no recuerdas el nombre exacto de un tipo.',
      inputSchema: {},
    },
    async () => asContent(listTypes()),
  );

  server.registerTool(
    'docviz_validate_document',
    {
      title: 'Validar documentacion',
      description:
        'Comprueba que todos los bloques declarativos de un documento sean interpretables, sin renderizar. ' +
        'Pasa `content` para validar un texto que acabas de escribir, o `source` para validar un directorio.',
      inputSchema: {
        content: z.string().optional().describe('Markdown a validar en memoria'),
        source: z.string().optional().describe('directorio de documentos fuente'),
        cwd: z.string().optional().describe('raiz del proyecto'),
      },
    },
    async (args) => asContent(await validateDocument(args)),
  );

  server.registerTool(
    'docviz_render_diagram',
    {
      title: 'Renderizar un diagrama',
      description:
        'Renderiza un unico diagrama declarativo y devuelve el recurso generado. ' +
        'Describe la intencion en `type` (por ejemplo uml-sequence, strategy-tree o bar); DocViz elige el motor.',
      inputSchema: {
        type: z.string().describe(`tipo de visualizacion: ${renderableTypes().join(', ')}`),
        source: z.string().describe('cuerpo declarativo del diagrama, en el DSL de DocViz'),
        title: z.string().optional().describe('titulo del diagrama'),
        theme: z.enum(themeNames() as [string, ...string[]]).optional(),
        outputDir: z.string().optional().describe('directorio donde escribir el recurso'),
        cwd: z.string().optional(),
      },
    },
    async (args) => asContent(await renderDiagram(args)),
  );

  server.registerTool(
    'docviz_build_document',
    {
      title: 'Compilar la documentacion',
      description:
        'Compila el directorio de documentos fuente a Markdown estandar con las imagenes ya generadas, ' +
        'y verifica que no queden imagenes rotas.',
      inputSchema: {
        source: z.string().optional(),
        output: z.string().optional(),
        theme: z.enum(themeNames() as [string, ...string[]]).optional(),
        clean: z.boolean().optional(),
        cwd: z.string().optional(),
      },
    },
    async (args) => asContent(await buildDocuments(args)),
  );

  server.registerTool(
    'docviz_preview',
    {
      title: 'Revisar el resultado compilado',
      description:
        'Devuelve el Markdown compilado y las incidencias detectadas (imagenes rotas, rutas absolutas, ' +
        'bloques sin compilar). Sin `document` devuelve el resumen de todo el directorio.',
      inputSchema: {
        document: z.string().optional().describe('ruta del documento dentro del directorio de salida'),
        output: z.string().optional(),
        cwd: z.string().optional(),
      },
    },
    async (args) => asContent(await previewDocument(args)),
  );

  return server;
}

export async function main(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}
