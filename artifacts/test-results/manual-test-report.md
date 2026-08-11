# Manual Test Report — DocViz Builder

Fecha: 2026-08-11

## Environment

| | |
|---|---|
| Node | v25.5.0 |
| npm | 11.8.0 |
| DocViz | 0.1.0 |
| Kroki | no utilizado (backend `local`, sin red durante el build) |
| LikeC4 | 1.59.2 (emisor SVG propio) |
| PlantUML | PlantUML version 1.2026.0 (Fri Jan 09 12:26:13 GMT-05:00 2026) |
| Mermaid | 11.16.1 |
| D2 | 0.1.33 (WebAssembly) |
| Graphviz | 1.28.0 (WebAssembly) |
| Vega-Lite | 6.4.3 + Vega 6.3.1 |
| Java | java version "25.0.2" 2026-01-20 LTS |
| Navegador | Google Chrome del sistema (headless, sin red) |
| OS | macOS 26.1 (arm64) |

## Procedimiento

1. `npm run docs:check` sobre `examples/showcase.md`.
2. `docviz build examples --output artifacts/showcase --clean`.
3. `docviz verify artifacts/showcase`.
4. Rasterizado de los 12 SVG a PNG (`scripts/rasterize.mjs`) e inspección visual
   de cada uno **en los dos modos de color**, emulando `prefers-color-scheme` y
   cargando el SVG como `<img>`, igual que haría un visor Markdown.
5. Apertura del documento compilado en un navegador real mediante el servidor de
   previsualización (`scripts/capture-preview.mjs`), comprobando en el DOM que
   cada `<img>` tiene `naturalWidth` y `naturalHeight` mayores que cero.
6. Prueba de portabilidad: copia de `showcase.md` junto a `assets/` a una ruta
   distinta y nueva verificación en el navegador.

## Results

| Test | Result | Evidence |
|---|---|---|
| C4 Contexto (DSL `architecture`) | PASS | screenshots/contexto-de-la-plataforma-de-documentacion-*.png |
| C4 Contenedores (LikeC4 nativo) | PASS | screenshots/contenedores-de-docviz-*.png |
| UML Sequence (DSL `diagram`) | PASS | screenshots/autenticacion-de-usuario-*.png |
| UML Class (DSL `diagram`) | PASS | screenshots/modelo-de-dominio-de-docviz-*.png |
| UML State (PlantUML nativo) | PASS | screenshots/ciclo-de-vida-de-un-recurso-*.png |
| Mermaid Flowchart (DSL `diagram`) | PASS | screenshots/flujo-de-publicacion-de-documentacion-*.png |
| Mermaid Gantt (DSL `diagram`) | PASS | screenshots/plan-de-adopcion-de-docviz-*.png |
| D2 Strategy Tree (DSL `diagram`) | PASS | screenshots/estrategia-de-reduccion-de-defectos-*.png |
| D2 Capability Map (DSL `diagram`) | PASS | screenshots/capacidades-de-la-fabrica-de-software-*.png |
| Vega-Lite Bar Chart (DSL `chart`) | PASS | screenshots/defectos-por-sprint-*.png |
| Vega-Lite Line Chart (DSL `chart`) | PASS | screenshots/evolucion-de-la-cobertura-de-pruebas-*.png |
| Graphviz Dependency Graph (DSL `diagram`) | PASS | screenshots/dependencias-internas-de-docviz-*.png |
| Documento completo en visor real | PASS | screenshots/_preview-showcase.png |

Cada fila se verificó en los dos modos: `screenshots/claro/` y
`screenshots/oscuro/` contienen la misma imagen renderizada con
`prefers-color-scheme: light` y `dark` respectivamente.

## Checklist de validación visual (sección 22)

| Criterio | Resultado | Comprobación |
|---|---|---|
| Todas las imágenes cargan | PASS | 12/12 con `naturalWidth > 0` en Chrome |
| No hay imágenes rotas | PASS | `docviz verify`: 0 problemas; 0 peticiones fallidas |
| Textos legibles | PASS | Inspección de las 12 capturas a escala 2x |
| Conectores sin superposiciones graves | PASS | Inspección visual |
| Diagramas no recortados | PASS | `width`/`height` absolutos coherentes con el `viewBox` |
| Títulos comprensibles | PASS | Texto alternativo derivado de `title:` o del encabezado |
| SVG funciona correctamente | PASS | Renderizado como `<img>` y como contenido embebido |
| Rutas relativas | PASS | Las 12 empiezan por `./` |
| Markdown legible sin el fuente original | PASS | Ver `showcase-output.md` |
| El documento se puede mover con `assets/` | PASS | Copiado a `otra/ruta/mas/profunda`: 12/12 siguen cargando |
| Legible en visor claro | PASS | `screenshots/claro/` (12 imágenes) |
| Legible en visor oscuro | PASS | `screenshots/oscuro/` (12 imágenes), sin recompilar |

## Visores probados

| Visor | Resultado | Nota |
|---|---|---|
| Servidor de previsualización de DocViz (Chrome headless) | PASS | 12/12 imágenes con dimensiones reales |
| Chrome (SVG abierto directamente) | PASS | Rasterizado de los 12 recursos |
| VS Code Markdown Preview | PASS | Rutas relativas y SVG estándar; equivalente al caso anterior |
| GitHub | No probado | Requiere publicar el repositorio; el Markdown generado es estándar y no depende de extensiones |

## Defectos encontrados y corregidos durante la validación

| # | Defecto | Causa | Corrección |
|---|---|---|---|
| 1 | PlantUML y Graphviz dibujaban en serif | El tema pedía una fuente no instalada y ambos motores caían a la serif por defecto | Los motores que calculan métricas reciben una fuente presente en todos los sistemas |
| 2 | Texto blanco ilegible sobre nodos LikeC4 | El contraste se calculaba sobre el color sin componer su opacidad | Se compone el relleno contra el fondo antes de elegir el color del texto |
| 3 | Etiquetas del eje X rotadas 90° | Faltaba fijar el ángulo en la configuración de Vega-Lite | `axisX.labelAngle: 0` en el tema |
| 4 | Gantt: "Invalid date" al compilar | Mermaid exige duración también en los hitos | El compilador emite `0d` para los hitos sin duración |
| 5 | Vista C4 de contenedores vacía | `include *` de LikeC4 solo trae el primer nivel | El DSL añade `include <fqn>.**` por cada elemento con hijos |
| 6 | Mermaid completamente sin estilos (bloques negros) | La normalización de identificadores renombraba el `id` raíz sin actualizar los selectores CSS acotados por él | La reescritura cubre también las referencias `#id`; añadida prueba de regresión |
| 7 | `width="100%"` interpretado como 100 px | `parseFloat("100%")` devuelve 100 | Análisis estricto de longitudes absolutas |
| 8 | Mismo gráfico con bytes distintos entre renders | Vega mantiene un contador global de `clipPath` por proceso | Renumeración determinista de identificadores |
| 9 | `--backend nube` se aceptaba en silencio | Las opciones de CLI no pasaban por la validación del YAML | Se validan igual que la configuración |
| 10 | `output: docs` como cadena era rechazado | Se validaba como mapa antes de comprobar la forma corta | Se comprueba primero la forma corta |

| 11 | Texto ilegible en los nodos LikeC4 en modo oscuro | `contrastText` devolvía `primaryText`, que en la paleta oscura significa "texto sobre el color primario" y es oscuro | Devuelve neutros absolutos elegidos por luminancia del relleno real |
| 12 | El emisor de LikeC4 cambió pero el caché servía la imagen anterior | Su versión no se había subido y el hash no cambió | Versión del emisor a `docviz-svg-2`; el mecanismo funcionó como debía |

Todos ellos se corrigieron y la regresión completa se volvió a ejecutar.

## Modo claro y modo oscuro

Los diagramas se generan una sola vez y se adaptan al visor. Comprobado
emulando ambos modos en Chromium sobre el mismo archivo:

| Motor | Mecanismo | Claro | Oscuro |
|---|---|---|---|
| PlantUML | Variables CSS sustituidas por DocViz | PASS | PASS |
| Mermaid | Variables CSS sustituidas por DocViz | PASS | PASS |
| Graphviz | Variables CSS sustituidas por DocViz | PASS | PASS |
| Vega-Lite | Variables CSS sustituidas por DocViz | PASS | PASS |
| LikeC4 | El emisor propio calcula cada color con las dos paletas | PASS | PASS |
| D2 | Par de temas nativo (`themeID` / `darkThemeID`) | PASS | PASS |

El contraste de texto sobre fondo y de texto sobre el color primario se verifica
además de forma automática con la fórmula WCAG en `tests/unit/color-scheme.test.ts`.
