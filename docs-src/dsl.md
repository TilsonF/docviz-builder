---
title: El DSL de alto nivel
---

# El DSL de alto nivel

Un agente que escribe documentación no debería tener que recordar la sintaxis de
seis motores distintos. El DSL de DocViz reduce todo a tres vallas:

| Valla | Cuándo usarla |
|---|---|
| `diagram` | Interacción, flujo, estados, dependencias o análisis estratégico |
| `chart` | Comparación cuantitativa, tendencia o distribución |
| `architecture` | Modelo C4 de contexto, contenedores o componentes |

El autor declara **la intención**; DocViz elige el motor.

## Qué motor atiende cada intención

<!-- docviz:tipos-reparto -->
```diagram
type: flow
title: Del tipo declarado al motor
direction: lr

flow:
  - DSL -> vega-lite: bar, horizontal-bar, stacked-bar y 14 mas
  - DSL -> plantuml: sequence, class, state y 9 mas
  - DSL -> mermaid: flow, gantt, journey y 8 mas
  - DSL -> d2: strategy-tree, issue-tree, decision-tree y 8 mas
  - DSL -> likec4: c4-context, c4-container, c4-component
  - DSL -> graphviz: dependency-map
  - DSL -> bpmn: bpmn
  - DSL -> svgbob: ascii
```
<!-- /docviz:tipos-reparto -->

## Regla de elección

No todo merece un diagrama. Las tablas de abajo son el criterio; cuando una
tabla Markdown o un párrafo comunican mejor, se usan ellos.

El catálogo cubre <!-- docviz:tipos-total -->57<!-- /docviz:tipos-total --> tipos.
Esta sección se genera desde él con `npm run docs:sync`, así que no puede
describir algo que el compilador no acepte.

<!-- docviz:tipos-tablas-3 -->
### Diagramas — bloque `diagram`

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
| Proceso de negocio en notacion BPMN estandar | `bpmn` | bpmn |
| Dibujo hecho con caracteres, convertido a SVG limpio | `ascii` | svgbob |

### Gráficos — bloque `chart`

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

### Arquitectura — bloque `architecture`

| Necesidad | `type` | Motor |
|---|---|---|
| El sistema, sus usuarios y los sistemas con los que habla | `c4-context` | likec4 (o plantuml-c4) |
| Las piezas desplegables del sistema y su tecnologia | `c4-container` | likec4 (o plantuml-c4) |
| Componentes internos de un contenedor | `c4-component` | likec4 (o plantuml-c4) |
<!-- /docviz:tipos-tablas-3 -->

## Ejemplo comentado

El bloque

````md
```diagram
type: sequence
title: Autenticación
participants:
  - Usuario
  - API
flow:
  - Usuario -> API: Login
  - API --> Usuario: Token
```
````

produce PlantUML con el tema del proyecto aplicado, lo renderiza a SVG y deja en
el documento compilado:

```md
![Autenticación](./assets/generated/autenticacion-<hash>.svg)
```

La flecha `->` es un mensaje y `-->` una respuesta. Los participantes se
declaran una sola vez y se referencian por nombre; nombrar uno que no existe
detiene el build con un mensaje que dice cuáles hay.

## Prioridad del título

El texto alternativo de la imagen y el nombre del archivo salen, en este orden:

1. el atributo `title="..."` de la valla;
2. el campo `title:` del DSL;
3. el encabezado inmediatamente anterior;
4. un nombre genérico según el tipo.

## Vía de escape

Los lenguajes nativos siguen disponibles (`plantuml`, `mermaid`, `d2`,
`graphviz`, `vega-lite`, `likec4`) para lo que el DSL todavía no cubra. La
diferencia es que entonces el autor sí debe conocer ese lenguaje.
