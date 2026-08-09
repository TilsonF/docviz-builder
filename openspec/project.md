# docviz-builder — contexto del proyecto

## Qué es

Un compilador que convierte bloques declarativos escritos dentro de Markdown
—diagramas UML, flujos, árboles estratégicos, gráficos y modelos C4— en imágenes
SVG, y reescribe el documento para que quede como Markdown estándar.

El resultado es portable: quien lo lee no necesita un visor que entienda
PlantUML, Mermaid, D2, Vega-Lite, Graphviz ni LikeC4. Solo necesita saber
mostrar una imagen.

## Por qué existe

Los agentes de IA escriben documentación con diagramas embebidos, pero cada
visor soporta un subconjunto distinto: GitHub renderiza Mermaid pero no D2, un
portal corporativo probablemente no renderice ninguno, y un PDF no renderiza
nada. La documentación acaba dependiendo de dónde se lea.

Además, obligar a un agente a dominar seis sintaxis produce errores: escribe
PlantUML donde correspondía D2, o inventa una directiva que no existe. El DSL de
alto nivel (`diagram`, `chart`, `architecture`) traslada esa decisión al
compilador.

## Restricción fundamental — nada sale a la red

**El build no realiza ninguna petición de red.** Los seis motores se ejecutan en
la máquina: JVM local para PlantUML, WebAssembly para D2 y Graphviz, JavaScript
en proceso para Vega-Lite, Chromium local para Mermaid y un emisor SVG propio
para LikeC4.

Las dos únicas excepciones son explícitas y opcionales: la descarga inicial de
`plantuml.jar` (`npm run setup`) y un backend Kroki self-hosted configurado a
mano. El servicio público `kroki.io` está bloqueado salvo autorización expresa.

Esto no es una preferencia: la documentación procesada puede ser confidencial.

## Determinismo

El mismo documento compilado dos veces debe producir los mismos bytes. De ello
dependen el caché, la reproducibilidad del build y que un `git diff` no muestre
ruido. El nombre de cada recurso es el hash de su contenido efectivo:

```
SHA256(tipo + fuente + tema + huella del tema + versión del motor + formato)
```

Cualquier fuente de no-determinismo del motor subyacente se neutraliza en el
post-proceso.

## Stack

| Área | Tecnología |
|---|---|
| Lenguaje | TypeScript ESM, Node ≥ 20.11 |
| Parser Markdown | unified + remark + mdast |
| CLI | commander |
| Pruebas | vitest, cobertura v8 |
| Motores | plantuml.jar, mermaid + puppeteer-core, @terrastruct/d2, vega/vega-lite, @hpcc-js/wasm-graphviz, likec4 |
| Agentes | @modelcontextprotocol/sdk |

## Convenciones

- Documentación y comentarios en español; el código fuente evita tildes.
- Los términos de dominio compartidos con las APIs de los motores se mantienen
  en inglés: `renderer`, `block`, `asset`, `theme`.
- Los comentarios explican **por qué**, no **qué**.
- Cobertura mínima: 90 % de líneas, sentencias y funciones; 85 % de ramas.
- Todo error de usuario lleva archivo, línea, motor y motivo.

## Estructura

```
src/core/        contratos, registry, hash, caché, rutas seguras, errores
src/config/      carga y validación de docviz.config.yaml
src/markdown/    detección sobre mdast y sustitución por posición
src/dsl/         compiladores de diagram, chart y architecture
src/renderers/   los seis motores, backend Kroki y utilidades de SVG
src/themes/      default, corporate, executive, dark
src/build/       orquestador, verificador y servidor de previsualización
src/mcp/         herramientas y servidor MCP
```

## Fuera de alcance por ahora

- Generación de PDF.
- Diagramas interactivos en el Markdown compilado (el resultado no depende de
  JavaScript, y es un requisito, no una limitación).
- Edición o reescritura de los documentos fuente.
