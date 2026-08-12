# Instrucciones para agentes — Documentación visual

Este proyecto usa **DocViz Builder** para generar diagramas, gráficos y
visualizaciones dentro de documentos Markdown.

## Regla principal

Modifica exclusivamente los documentos fuente de:

```
docs-src/
```

No edites nunca a mano:

```
docs/
docs/assets/generated/
```

Son directorios generados. Cualquier cambio manual se pierde en la siguiente
compilación.

---

## Describe la intención, no la tecnología

DocViz sabe qué motor usar. Tú solo declaras qué quieres explicar, con una de
estas tres vallas:

| Valla | Cuándo |
|---|---|
| `diagram` | Interacción, flujo, estados, dependencias, análisis estratégico |
| `chart` | Comparación cuantitativa, tendencia, distribución |
| `architecture` | Modelo C4 |

### Qué tipo elegir

Busca por **lo que quieres explicar**, no por la tecnología.

#### Diagramas — bloque `diagram`

| Necesidad | `type` | Motor |
|---|---|---|
| Quien habla con quien y en que orden | `sequence` | plantuml |
| Estructura de clases o entidades y sus relaciones | `class` | plantuml |
| Estados de una entidad y las transiciones entre ellos | `state` | plantuml |
| Proceso con decisiones y ramas paralelas | `activity` | plantuml |
| Entidades de datos, sus campos y su cardinalidad | `erd` | plantuml (o mermaid) |
| Que puede hacer cada actor con el sistema | `use-case` | plantuml |
| Componentes de software agrupados y como se conectan | `component` | plantuml |
| Donde se ejecuta cada pieza y sobre que infraestructura | `deployment` | plantuml |
| Boceto de una pantalla: campos, botones y disposicion | `wireframe` | plantuml |
| Estructura de un JSON dibujada como arbol | `json` | plantuml |
| Estructura de un YAML dibujada como arbol | `yaml` | plantuml |
| Descomposicion jerarquica del trabajo de un proyecto | `wbs` | plantuml |
| Flujo sencillo de extremo a extremo | `flow` | mermaid (o d2) |
| Tareas situadas en el calendario | `gantt` | mermaid (o plantuml) |
| Recorrido de una persona por un proceso, con su nivel de satisfaccion | `journey` | mermaid |
| Historia de ramas, commits y fusiones | `git-graph` | mermaid |
| Tarjetas repartidas por columna de estado | `kanban` | mermaid |
| Elementos situados en dos ejes continuos | `quadrant` | mermaid |
| Como se reparte una cantidad al pasar de un estado a otro | `sankey` | mermaid |
| Composicion de un total por area proporcional | `treemap` | mermaid |
| Perfil de varias dimensiones a la vez | `radar` | mermaid |
| Exploracion de un tema en ramas libres | `mindmap` | mermaid (o plantuml) |
| Bloques dispuestos en rejilla, sin semantica de flujo | `block` | mermaid |
| Descomposicion de un objetivo en lineas de accion | `strategy-tree` | d2 |
| Descomposicion de un problema en sus causas | `issue-tree` | d2 |
| Alternativas de una decision y sus ramas | `decision-tree` | d2 |
| Pilares que sostienen un objetivo, con su contenido | `strategy-pillars` | d2 |
| Capacidades agrupadas por dominio | `capability-map` | d2 |
| Capas de un modelo operativo, de negocio a infraestructura | `operating-model` | d2 |
| Etapas encadenadas que generan valor | `value-chain` | d2 |
| Comparacion de dos escenarios | `before-after` | d2 |
| Cuatro cuadrantes con su contenido, sin coordenadas | `matrix-2x2` | d2 |
| Hitos en orden cronologico | `timeline` | d2 (o mermaid) |
| Fases futuras con su contenido | `roadmap` | d2 |
| Quien depende de quien | `dependency-map` | graphviz |
| Proceso de negocio en notacion BPMN, con carriles por rol | `bpmn` | bpmn |
| Dibujo hecho con caracteres, convertido a SVG limpio | `ascii` | svgbob |

#### Gráficos — bloque `chart`

| Necesidad | `type` | Motor |
|---|---|---|
| Comparacion entre categorias | `bar` | vega-lite |
| Comparacion entre categorias con etiquetas largas | `horizontal-bar` | vega-lite |
| Composicion de un total por categoria | `stacked-bar` | vega-lite |
| Comparacion de varias series por categoria | `grouped-bar` | vega-lite |
| Evolucion de una magnitud en el tiempo | `line` | vega-lite |
| Evolucion con enfasis en el volumen acumulado | `area` | vega-lite |
| Evolucion de la composicion de un total | `stacked-area` | vega-lite |
| Relacion entre dos magnitudes | `scatter` | vega-lite |
| Densidad de una magnitud en dos dimensiones categoricas | `heatmap` | vega-lite |
| Distribucion de una variable continua | `histogram` | vega-lite |
| Mediana, dispersion y valores atipicos por grupo | `box-plot` | vega-lite |
| Valor real frente a su objetivo | `bullet` | vega-lite |
| Cambio entre dos momentos, elemento a elemento | `slope` | vega-lite |
| Caida de volumen a lo largo de etapas sucesivas | `funnel` | vega-lite |
| Reparto de un total entre pocas partes | `pie` | vega-lite |
| Reparto de un total, con el centro libre para un dato o un titulo | `donut` | vega-lite |
| Como se llega de un valor inicial a uno final, paso a paso | `waterfall` | vega-lite |

#### Arquitectura — bloque `architecture`

| Necesidad | `type` | Motor |
|---|---|---|
| El sistema, sus usuarios y los sistemas con los que habla | `c4-context` | likec4 (o plantuml-c4) |
| Las piezas desplegables del sistema y su tecnologia | `c4-container` | likec4 (o plantuml-c4) |
| Componentes internos de un contenedor | `c4-component` | likec4 (o plantuml-c4) |

No hace falta memorizar la tabla. Si dudas, describe en una frase lo que quieres
explicar y llama a `docviz_suggest`: devuelve el tipo recomendado y el bloque
listo para rellenar. `docviz types` lista el catálogo completo con el propósito
y un ejemplo de cada tipo.

---

## Ejemplos

### Interacción

````md
```diagram
type: sequence
title: Autenticación de usuario

participants:
  - Usuario
  - Frontend
  - Entra ID
  - API

flow:
  - Usuario -> Frontend: Login
  - Frontend -> Entra ID: Authenticate
  - Entra ID --> Frontend: Token
  - Frontend -> API: Request + Token
```
````

`->` es un mensaje; `-->` una respuesta.

### Análisis estratégico

````md
```diagram
type: strategy-tree
title: Estrategia de calidad

root: Mejorar calidad

branches:
  - name: Automatización
    children:
      - Pruebas de regresión
      - Pipeline de CI
  - Arquitectura
  - Proceso
```
````

### Datos

````md
```chart
type: bar
title: Defectos por sprint

data:
  - label: SP1
    value: 42
  - label: SP2
    value: 28
  - label: SP3
    value: 15
```
````

### Arquitectura

````md
```architecture
type: c4-context
title: Contexto de la plataforma

elements:
  - id: usuario
    kind: person
    name: Usuario
  - id: core
    kind: system
    name: Plataforma
    description: Núcleo de negocio
  - id: bd
    kind: database
    name: Base de datos

relations:
  - from: usuario
    to: core
    label: Utiliza
  - from: core
    to: bd
    label: Persiste
```
````

---

## Flujo obligatorio

Después de crear o modificar documentación:

1. Guarda los cambios en `docs-src/`.
2. Ejecuta:

```bash
npm run docs:check
```

3. Corrige cualquier error reportado. Los mensajes indican archivo, línea, motor
   y motivo; no adivines.
4. Ejecuta:

```bash
npm run docs:build
```

5. Verifica que se hayan generado los Markdown finales y sus imágenes:

```bash
npm run docs:test
```

6. Revisa visualmente el resultado:

```bash
npm run docs:preview
```

No reportes la tarea como terminada mientras existan errores de renderizado o
imágenes rotas.

---

## Reglas

- No generes manualmente archivos SVG o PNG cuando DocViz pueda generarlos.
- No modifiques a mano hashes ni nombres de imagen.
- No introduzcas rutas absolutas.
- No referencies imágenes temporales.
- No envíes documentación confidencial a servicios externos.
- No sustituyas diagramas declarativos por capturas de pantalla.
- No edites nada dentro de `docs/assets/generated`.
- Los diagramas viven como código dentro de `docs-src`.

---

## Cuándo crear una visualización

Antes de dibujar, pregúntate si realmente mejora la comprensión. Usa
visualizaciones sobre todo para:

- arquitectura;
- interacción entre componentes;
- flujos complejos;
- estados;
- dependencias;
- análisis estratégicos;
- comparaciones cuantitativas;
- tendencias;
- hojas de ruta;
- modelos operativos.

Para información sencilla, usa texto o una tabla Markdown. Una tabla de tres
filas no necesita un diagrama.

---

## Calidad visual

Una visualización debe:

- tener un objetivo claro;
- tener un título descriptivo (`title:`);
- evitar cruces innecesarios;
- evitar exceso de nodos;
- mantener los textos cortos;
- ser legible al renderizarse;
- usar el tema definido por el proyecto (no fijes colores a mano).

Los colores del tema traen su equivalente en modo oscuro, así que la misma
imagen se lee bien en un visor claro y en uno oscuro. Un color escrito a mano
pierde esa propiedad: quedará igual en ambos modos y probablemente ilegible en
uno de ellos.

Cuando un diagrama crezca demasiado, divídelo en varios con objetivos
diferentes. Un diagrama con veinte cajas no explica nada.

---

## Herramientas MCP

Si tu cliente tiene el servidor MCP de DocViz configurado, prefiérelo a ejecutar
comandos:

| Herramienta | Uso |
|---|---|
| `docviz_suggest` | Describir en una frase qué quieres explicar y recibir el tipo y el bloque |
| `docviz_types` | Consultar el catálogo completo con propósito y ejemplos |
| `docviz_validate_document` | Validar lo que acabas de escribir, antes de guardarlo |
| `docviz_render_diagram` | Probar un diagrama suelto |
| `docviz_build_document` | Compilar la documentación |
| `docviz_preview` | Revisar el resultado y detectar imágenes rotas |

---

## Al terminar

Reporta:

- documentos modificados;
- visualizaciones agregadas y su tipo;
- resultado de `docs:check`;
- resultado de `docs:build`;
- resultado de `docs:test`;
- resultado de la validación visual.

La documentación solo se considera terminada cuando el build y las validaciones
son satisfactorios.
