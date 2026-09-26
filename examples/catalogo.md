---
title: Catalogo de visualizaciones
---

# Catalogo de visualizaciones

Todos los tipos que DocViz sabe dibujar, cada uno con el bloque que lo
produce y el resultado ya compilado.

Este documento **no se escribe a mano**: lo genera `npm run catalog` a partir
del catalogo de tipos, de modo que no puede quedar desfasado respecto a lo que
el compilador admite de verdad.

| Tipo | Para que sirve | Motor |
|---|---|---|
| `sequence` | Quien habla con quien y en que orden. | plantuml |
| `class` | Estructura de clases o entidades y sus relaciones. | plantuml |
| `state` | Estados de una entidad y las transiciones entre ellos. | plantuml |
| `activity` | Proceso con decisiones y ramas paralelas. | plantuml |
| `erd` | Entidades de datos, sus campos y su cardinalidad. | plantuml |
| `use-case` | Que puede hacer cada actor con el sistema. | plantuml |
| `component` | Componentes de software agrupados y como se conectan. | plantuml |
| `deployment` | Donde se ejecuta cada pieza y sobre que infraestructura. | plantuml |
| `wireframe` | Boceto de una pantalla: campos, botones y disposicion. | plantuml |
| `json` | Estructura de un JSON dibujada como arbol. | plantuml |
| `yaml` | Estructura de un YAML dibujada como arbol. | plantuml |
| `wbs` | Descomposicion jerarquica del trabajo de un proyecto. | plantuml |
| `flow` | Flujo sencillo de extremo a extremo. | mermaid |
| `gantt` | Tareas situadas en el calendario. | mermaid |
| `journey` | Recorrido de una persona por un proceso, con su nivel de satisfaccion. | mermaid |
| `git-graph` | Historia de ramas, commits y fusiones. | mermaid |
| `kanban` | Tarjetas repartidas por columna de estado. | mermaid |
| `quadrant` | Elementos situados en dos ejes continuos. | mermaid |
| `sankey` | Como se reparte una cantidad al pasar de un estado a otro. | mermaid |
| `treemap` | Composicion de un total por area proporcional. | mermaid |
| `radar` | Perfil de varias dimensiones a la vez. | mermaid |
| `mindmap` | Exploracion de un tema en ramas libres. | mermaid |
| `block` | Bloques dispuestos en rejilla, sin semantica de flujo. | mermaid |
| `strategy-tree` | Descomposicion de un objetivo en lineas de accion. | d2 |
| `issue-tree` | Descomposicion de un problema en sus causas. | d2 |
| `decision-tree` | Alternativas de una decision y sus ramas. | d2 |
| `strategy-pillars` | Pilares que sostienen un objetivo, con su contenido. | d2 |
| `capability-map` | Capacidades agrupadas por dominio. | d2 |
| `operating-model` | Capas de un modelo operativo, de negocio a infraestructura. | d2 |
| `value-chain` | Etapas encadenadas que generan valor. | d2 |
| `before-after` | Comparacion de dos escenarios. | d2 |
| `matrix-2x2` | Cuatro cuadrantes con su contenido, sin coordenadas. | d2 |
| `timeline` | Hitos en orden cronologico. | d2 |
| `roadmap` | Fases futuras con su contenido. | d2 |
| `dependency-map` | Quien depende de quien. | graphviz |
| `bpmn` | Proceso de negocio en notacion BPMN estandar. | bpmn |
| `ascii` | Dibujo hecho con caracteres, convertido a SVG limpio. | svgbob |
| `bar` | Comparacion entre categorias. | vega-lite |
| `horizontal-bar` | Comparacion entre categorias con etiquetas largas. | vega-lite |
| `stacked-bar` | Composicion de un total por categoria. | vega-lite |
| `grouped-bar` | Comparacion de varias series por categoria. | vega-lite |
| `line` | Evolucion de una magnitud en el tiempo. | vega-lite |
| `area` | Evolucion con enfasis en el volumen acumulado. | vega-lite |
| `stacked-area` | Evolucion de la composicion de un total. | vega-lite |
| `scatter` | Relacion entre dos magnitudes. | vega-lite |
| `heatmap` | Densidad de una magnitud en dos dimensiones categoricas. | vega-lite |
| `histogram` | Distribucion de una variable continua. | vega-lite |
| `box-plot` | Mediana, dispersion y valores atipicos por grupo. | vega-lite |
| `bullet` | Valor real frente a su objetivo. | vega-lite |
| `lollipop` | Comparacion entre categorias con menos tinta que una barra. | vega-lite |
| `sparkline` | El gesto de una serie, sin ejes y en el tamano de una frase. | vega-lite |
| `kpi-card` | Una fila de numeros grandes, cada uno con su etiqueta y su meta. | vega-lite |
| `calendar-heatmap` | Un periodo largo en celdas: semana en horizontal, dia en vertical. | vega-lite |
| `bump` | Como cambia una clasificacion: quien adelanta a quien. | vega-lite |
| `slope` | Cambio entre dos momentos, elemento a elemento. | vega-lite |
| `funnel` | Caida de volumen a lo largo de etapas sucesivas. | vega-lite |
| `pie` | Reparto de un total entre pocas partes. | vega-lite |
| `donut` | Reparto de un total, con el centro libre para un dato o un titulo. | vega-lite |
| `waterfall` | Como se llega de un valor inicial a uno final, paso a paso. | vega-lite |
| `c4-context` | El sistema, sus usuarios y los sistemas con los que habla. | likec4 |
| `c4-container` | Las piezas desplegables del sistema y su tecnologia. | likec4 |
| `c4-component` | Componentes internos de un contenedor. | likec4 |

---

## Diagramas

Se declaran en un bloque `diagram`. El campo `type` expresa la intencion; el motor lo elige DocViz.

### `sequence`

Quien habla con quien y en que orden.

**Cuando usarlo.** Para explicar una interaccion entre componentes a lo largo del tiempo: un login, un pago, una llamada entre servicios.

**Cuando no.** Si el orden temporal no importa; entonces es un diagrama de componentes o de dependencias.

Alias: `uml-sequence`. Si falta plantuml, se dibuja con d2.

````md
```diagram
type: sequence
title: Autenticacion
participants:
  - Usuario
  - API
flow:
  - Usuario -> API: Login
  - API --> Usuario: Token
```
````

```diagram title="sequence"
type: sequence
title: Autenticacion
participants:
  - Usuario
  - API
flow:
  - Usuario -> API: Login
  - API --> Usuario: Token
```

### `class`

Estructura de clases o entidades y sus relaciones.

**Cuando usarlo.** Para el modelo de dominio de un sistema orientado a objetos, con atributos, metodos y herencia.

**Cuando no.** Si lo que describes son tablas y claves foraneas: usa `erd`.

Alias: `uml-class`. Si falta plantuml, se dibuja con d2.

````md
```diagram
type: class
title: Modelo de dominio
classes:
  - name: Pedido
    attributes: [id, total]
    methods: [confirmar]
  - name: Linea
relations:
  - from: Pedido
    to: Linea
    type: composition
```
````

```diagram title="class"
type: class
title: Modelo de dominio
classes:
  - name: Pedido
    attributes: [id, total]
    methods: [confirmar]
  - name: Linea
relations:
  - from: Pedido
    to: Linea
    type: composition
```

### `state`

Estados de una entidad y las transiciones entre ellos.

**Cuando usarlo.** Cuando algo tiene un ciclo de vida: un pedido, una solicitud, un despliegue.

**Cuando no.** Si el proceso es una secuencia de tareas sin estados propios: usa `activity` o `flow`.

Alias: `uml-state`. Si falta plantuml, se dibuja con d2.

````md
```diagram
type: state
title: Ciclo de vida
states: [Borrador, Publicado]
initial: Borrador
transitions:
  - Borrador -> Publicado: publicar
finals: [Publicado]
```
````

```diagram title="state"
type: state
title: Ciclo de vida
states: [Borrador, Publicado]
initial: Borrador
transitions:
  - Borrador -> Publicado: publicar
finals: [Publicado]
```

### `activity`

Proceso con decisiones y ramas paralelas.

**Cuando usarlo.** Cuando hay condiciones que bifurcan el camino: validaciones, aprobaciones, reintentos.

**Cuando no.** Si el proceso es lineal y sencillo: `flow` queda mas limpio. Si es un proceso de negocio con roles: `bpmn`.

Alias: `uml-activity`. Si falta plantuml, se dibuja con d2.

````md
```diagram
type: activity
title: Validacion
flow:
  - Recibir solicitud
  - decision: Es valida?
    yes:
      - Procesar
    no:
      - Rechazar
```
````

```diagram title="activity"
type: activity
title: Validacion
flow:
  - Recibir solicitud
  - decision: Es valida?
    yes:
      - Procesar
    no:
      - Rechazar
```

### `erd`

Entidades de datos, sus campos y su cardinalidad.

**Cuando usarlo.** Para documentar un modelo de datos relacional: tablas, claves y cardinalidades.

**Cuando no.** Si el foco es el comportamiento y no los datos: usa `class`.

Alias: `entity-relationship`, `entidad-relacion`. Si falta plantuml, se dibuja con mermaid.

````md
```diagram
type: erd
title: Modelo de datos
entities:
  - name: Pedido
    fields:
      - name: id
        type: uuid
        key: true
      - name: total
        type: decimal
  - name: Linea
    fields:
      - name: id
        type: uuid
        key: true
relations:
  - from: Pedido
    to: Linea
    cardinality: one-to-many
    label: contiene
```
````

```diagram title="erd"
type: erd
title: Modelo de datos
entities:
  - name: Pedido
    fields:
      - name: id
        type: uuid
        key: true
      - name: total
        type: decimal
  - name: Linea
    fields:
      - name: id
        type: uuid
        key: true
relations:
  - from: Pedido
    to: Linea
    cardinality: one-to-many
    label: contiene
```

### `use-case`

Que puede hacer cada actor con el sistema.

**Cuando usarlo.** Para delimitar el alcance funcional frente a usuarios y sistemas externos.

**Cuando no.** Si necesitas detallar como ocurre cada caso: eso es `sequence` o `activity`.

Alias: `casos-de-uso`. Si falta plantuml, se dibuja con d2.

````md
```diagram
type: use-case
title: Alcance del portal
system: Portal de pagos
actors:
  - Cliente
  - Operador
useCases:
  - name: Realizar pago
    actors: [Cliente]
  - name: Conciliar
    actors: [Operador]
```
````

```diagram title="use-case"
type: use-case
title: Alcance del portal
system: Portal de pagos
actors:
  - Cliente
  - Operador
useCases:
  - name: Realizar pago
    actors: [Cliente]
  - name: Conciliar
    actors: [Operador]
```

### `component`

Componentes de software agrupados y como se conectan.

**Cuando usarlo.** Para la estructura interna de una aplicacion cuando C4 resulta excesivo.

**Cuando no.** Si describes el sistema completo y su entorno: usa `c4-context` o `c4-container`.

Alias: `componentes`. Si falta plantuml, se dibuja con d2.

````md
```diagram
type: component
title: Componentes
groups:
  - name: Frontend
    components: [UI]
  - name: Backend
    components: [API, Servicio]
relations:
  - UI -> API
  - API -> Servicio
```
````

```diagram title="component"
type: component
title: Componentes
groups:
  - name: Frontend
    components: [UI]
  - name: Backend
    components: [API, Servicio]
relations:
  - UI -> API
  - API -> Servicio
```

### `deployment`

Donde se ejecuta cada pieza y sobre que infraestructura.

**Cuando usarlo.** Para documentar nodos, contenedores, artefactos y las bases de datos de un entorno.

**Cuando no.** Si el interes es la responsabilidad logica y no la maquina: usa `component` o C4.

Alias: `despliegue`. Si falta plantuml, se dibuja con d2.

````md
```diagram
type: deployment
title: Entorno de produccion
nodes:
  - name: Servidor web
    kind: node
    contains: [app.jar]
  - name: PostgreSQL
    kind: database
relations:
  - Servidor web -> PostgreSQL: JDBC
```
````

```diagram title="deployment"
type: deployment
title: Entorno de produccion
nodes:
  - name: Servidor web
    kind: node
    contains: [app.jar]
  - name: PostgreSQL
    kind: database
relations:
  - Servidor web -> PostgreSQL: JDBC
```

### `wireframe`

Boceto de una pantalla: campos, botones y disposicion.

**Cuando usarlo.** Para acordar una interfaz sin abrir una herramienta de diseno, dentro del propio documento.

**Cuando no.** Si necesitas fidelidad visual real; esto es un boceto, no un diseno.

Alias: `mockup`, `ui`.

````md
```diagram
type: wireframe
title: Inicio de sesion
rows:
  - fields:
      - label: Usuario
        input: text
  - fields:
      - label: Clave
        input: password
  - buttons: [Cancelar, Entrar]
```
````

```diagram title="wireframe"
type: wireframe
title: Inicio de sesion
rows:
  - fields:
      - label: Usuario
        input: text
  - fields:
      - label: Clave
        input: password
  - buttons: [Cancelar, Entrar]
```

### `json`

Estructura de un JSON dibujada como arbol.

**Cuando usarlo.** Para documentar el cuerpo de una peticion o respuesta de API de un vistazo.

**Cuando no.** Si el JSON es corto: un bloque de codigo se lee mejor y se puede copiar.

````md
```diagram
type: json
title: Respuesta de /pedidos
data:
  id: 1
  estado: confirmado
```
````

```diagram title="json"
type: json
title: Respuesta de /pedidos
data:
  id: 1
  estado: confirmado
```

### `yaml`

Estructura de un YAML dibujada como arbol.

**Cuando usarlo.** Para explicar un manifiesto o una configuracion extensa por su forma.

**Cuando no.** Si el archivo es corto o el lector va a copiarlo: usa un bloque de codigo.

````md
```diagram
type: yaml
title: Configuracion
data:
  replicas: 3
  puertos:
    - 8080
```
````

```diagram title="yaml"
type: yaml
title: Configuracion
data:
  replicas: 3
  puertos:
    - 8080
```

### `wbs`

Descomposicion jerarquica del trabajo de un proyecto.

**Cuando usarlo.** Para desglosar un alcance en entregables y paquetes de trabajo.

**Cuando no.** Si lo que importa son las fechas: usa `gantt`. Si es un analisis causal: `issue-tree`.

Alias: `work-breakdown`. Si falta plantuml, se dibuja con d2.

````md
```diagram
type: wbs
title: Alcance del proyecto
root: Portal de pagos
branches:
  - name: Analisis
    children: [Requisitos, Casos de prueba]
  - name: Construccion
```
````

```diagram title="wbs"
type: wbs
title: Alcance del proyecto
root: Portal de pagos
branches:
  - name: Analisis
    children: [Requisitos, Casos de prueba]
  - name: Construccion
```

### `flow`

Flujo sencillo de extremo a extremo.

**Cuando usarlo.** Para encadenar pasos o componentes cuando basta con ver por donde pasa la cosa.

**Cuando no.** Si hay muchas condiciones: `activity`. Si es una interaccion temporal: `sequence`.

Alias: `flowchart`. Si falta mermaid, se dibuja con d2.

````md
```diagram
type: flow
title: Publicacion
direction: lr
flow:
  - Autor -> Revision
  - Revision -> Portal
```
````

```diagram title="flow"
type: flow
title: Publicacion
direction: lr
flow:
  - Autor -> Revision
  - Revision -> Portal
```

### `gantt`

Tareas situadas en el calendario.

**Cuando usarlo.** Para un plan con fechas y dependencias entre tareas.

**Cuando no.** Si no hay fechas concretas: usa `roadmap` o `timeline`.

Alias: `cronograma`. Si falta mermaid, se dibuja con plantuml o vega-lite.

````md
```diagram
type: gantt
title: Plan
sections:
  - name: Fase 1
    tasks:
      - name: Analisis
        start: 2026-01-05
        duration: 5d
```
````

```diagram title="gantt"
type: gantt
title: Plan
sections:
  - name: Fase 1
    tasks:
      - name: Analisis
        start: 2026-01-05
        duration: 5d
```

### `journey`

Recorrido de una persona por un proceso, con su nivel de satisfaccion.

**Cuando usarlo.** Para mostrar donde sufre el usuario y quien interviene en cada paso.

**Cuando no.** Si el interes es tecnico y no la experiencia: usa `flow` o `sequence`.

Alias: `user-journey`, `recorrido`. Si falta mermaid, se dibuja con d2.

````md
```diagram
type: journey
title: Alta de cliente
sections:
  - name: Registro
    steps:
      - name: Rellenar formulario
        score: 3
        actors: [Cliente]
      - name: Verificar correo
        score: 2
        actors: [Cliente]
  - name: Activacion
    steps:
      - name: Aprobar cuenta
        score: 4
        actors: [Operador]
      - name: Primer acceso
        score: 5
        actors: [Cliente]
```
````

```diagram title="journey"
type: journey
title: Alta de cliente
sections:
  - name: Registro
    steps:
      - name: Rellenar formulario
        score: 3
        actors: [Cliente]
      - name: Verificar correo
        score: 2
        actors: [Cliente]
  - name: Activacion
    steps:
      - name: Aprobar cuenta
        score: 4
        actors: [Operador]
      - name: Primer acceso
        score: 5
        actors: [Cliente]
```

### `git-graph`

Historia de ramas, commits y fusiones.

**Cuando usarlo.** Para explicar la estrategia de ramificacion del equipo.

**Cuando no.** Si lo que documentas es el proceso de revision, no la topologia: usa `flow`.

Alias: `gitgraph`, `commit-graph`, `ramas`.

````md
```diagram
type: git-graph
title: Estrategia de ramas
commits:
  - commit: inicial
  - branch: develop
  - commit: funcionalidad
  - checkout: main
  - merge: develop
```
````

```diagram title="git-graph"
type: git-graph
title: Estrategia de ramas
commits:
  - commit: inicial
  - branch: develop
  - commit: funcionalidad
  - checkout: main
  - merge: develop
```

### `kanban`

Tarjetas repartidas por columna de estado.

**Cuando usarlo.** Para fotografiar el estado de un tablero en un informe.

**Cuando no.** Si el tablero cambia a diario: enlaza la herramienta en vez de congelarlo.

Alias: `tablero`. Si falta mermaid, se dibuja con d2.

````md
```diagram
type: kanban
title: Sprint 12
columns:
  - name: Pendiente
    items: [Analisis de HU-14]
  - name: En curso
    items: [Diseno de API]
```
````

```diagram title="kanban"
type: kanban
title: Sprint 12
columns:
  - name: Pendiente
    items: [Analisis de HU-14]
  - name: En curso
    items: [Diseno de API]
```

### `quadrant`

Elementos situados en dos ejes continuos.

**Cuando usarlo.** Para priorizar con datos: cada elemento tiene una posicion concreta, no solo un cuadrante.

**Cuando no.** Si solo quieres nombrar los cuatro cuadrantes sin situar nada: usa `matrix-2x2`.

Alias: `quadrant-chart`. Si falta mermaid, se dibuja con vega-lite.

````md
```diagram
type: quadrant
title: Priorizacion
xAxis: [Bajo esfuerzo, Alto esfuerzo]
yAxis: [Bajo impacto, Alto impacto]
quadrants: [Hacer ya, Planificar, Descartar, Delegar]
items:
  - name: Automatizar pruebas
    x: 0.3
    y: 0.8
```
````

```diagram title="quadrant"
type: quadrant
title: Priorizacion
xAxis: [Bajo esfuerzo, Alto esfuerzo]
yAxis: [Bajo impacto, Alto impacto]
quadrants: [Hacer ya, Planificar, Descartar, Delegar]
items:
  - name: Automatizar pruebas
    x: 0.3
    y: 0.8
```

### `sankey`

Como se reparte una cantidad al pasar de un estado a otro.

**Cuando usarlo.** Para mostrar volumenes que se dividen: origen de los defectos, embudo de conversion con fugas.

**Cuando no.** Si solo comparas totales sin flujo entre ellos: usa `bar`.

````md
```diagram
type: sankey
title: Origen de los defectos
flows:
  - from: Requisitos
    to: Produccion
    value: 12
  - from: Codigo
    to: Produccion
    value: 30
```
````

```diagram title="sankey"
type: sankey
title: Origen de los defectos
flows:
  - from: Requisitos
    to: Produccion
    value: 12
  - from: Codigo
    to: Produccion
    value: 30
```

### `treemap`

Composicion de un total por area proporcional.

**Cuando usarlo.** Para ver de un vistazo quien pesa mas dentro de un conjunto jerarquico.

**Cuando no.** Si comparas pocas categorias sin jerarquia: `bar` es mas preciso de leer.

````md
```diagram
type: treemap
title: Esfuerzo por modulo
groups:
  - name: Backend
    items:
      - name: API
        value: 40
      - name: Batch
        value: 20
```
````

```diagram title="treemap"
type: treemap
title: Esfuerzo por modulo
groups:
  - name: Backend
    items:
      - name: API
        value: 40
      - name: Batch
        value: 20
```

### `radar`

Perfil de varias dimensiones a la vez.

**Cuando usarlo.** Para evaluaciones de madurez o capacidad, y para comparar dos perfiles.

**Cuando no.** Con mas de siete ejes o si las dimensiones no son comparables entre si.

Alias: `spider`, `madurez`. Si falta mermaid, se dibuja con vega-lite.

````md
```diagram
type: radar
title: Madurez del equipo
axes: [Proceso, Calidad, Arquitectura, Automatizacion]
max: 5
series:
  - name: Actual
    values: [3, 4, 2, 3]
```
````

```diagram title="radar"
type: radar
title: Madurez del equipo
axes: [Proceso, Calidad, Arquitectura, Automatizacion]
max: 5
series:
  - name: Actual
    values: [3, 4, 2, 3]
```

### `mindmap`

Exploracion de un tema en ramas libres.

**Cuando usarlo.** Para abrir un alcance o recoger ideas antes de estructurarlas.

**Cuando no.** Si la jerarquia ya es firme y dirigida: `strategy-tree` comunica mejor la intencion.

Alias: `mapa-mental`. Si falta mermaid, se dibuja con plantuml.

````md
```diagram
type: mindmap
title: Alcance
root: Plataforma
branches:
  - name: Pagos
    children: [Tarjeta, Transferencia]
  - Reportes
```
````

```diagram title="mindmap"
type: mindmap
title: Alcance
root: Plataforma
branches:
  - name: Pagos
    children: [Tarjeta, Transferencia]
  - Reportes
```

### `block`

Bloques dispuestos en rejilla, sin semantica de flujo.

**Cuando usarlo.** Para capas, bandas o una vista esquematica donde la posicion importa mas que las flechas.

**Cuando no.** Si hay relaciones que explicar: usa `flow` o `component`.

Alias: `bloques`. Si falta mermaid, se dibuja con d2.

````md
```diagram
type: block
title: Capas
rows:
  - [Presentacion]
  - [Aplicacion, Dominio]
  - [Infraestructura]
```
````

```diagram title="block"
type: block
title: Capas
rows:
  - [Presentacion]
  - [Aplicacion, Dominio]
  - [Infraestructura]
```

### `strategy-tree`

Descomposicion de un objetivo en lineas de accion.

**Cuando usarlo.** Para bajar un objetivo a iniciativas concretas ante direccion.

**Cuando no.** Si exploras causas de un problema: `issue-tree` nombra mejor la intencion.

````md
```diagram
type: strategy-tree
title: Estrategia de calidad
root: Reducir defectos
branches:
  - name: Automatizacion
    children: [Pruebas de regresion]
  - Proceso
```
````

```diagram title="strategy-tree"
type: strategy-tree
title: Estrategia de calidad
root: Reducir defectos
branches:
  - name: Automatizacion
    children: [Pruebas de regresion]
  - Proceso
```

### `issue-tree`

Descomposicion de un problema en sus causas.

**Cuando usarlo.** Para analisis de causa raiz o para estructurar un diagnostico.

**Cuando no.** Si ya sabes que hacer y solo quieres presentarlo: `strategy-tree`.

````md
```diagram
type: issue-tree
title: Analisis
root: Defectos en produccion
branches: [Requisitos, Pruebas]
```
````

```diagram title="issue-tree"
type: issue-tree
title: Analisis
root: Defectos en produccion
branches: [Requisitos, Pruebas]
```

### `decision-tree`

Alternativas de una decision y sus ramas.

**Cuando usarlo.** Para presentar opciones excluyentes y a que lleva cada una.

**Cuando no.** Si la decision ocurre dentro de un proceso: usa `activity`.

````md
```diagram
type: decision-tree
title: Decision
root: Comprar o construir
branches: [Comprar, Construir]
```
````

```diagram title="decision-tree"
type: decision-tree
title: Decision
root: Comprar o construir
branches: [Comprar, Construir]
```

### `strategy-pillars`

Pilares que sostienen un objetivo, con su contenido.

**Cuando usarlo.** Para una lamina de direccion con tres o cuatro ejes y sus iniciativas.

**Cuando no.** Si la jerarquia tiene mas de dos niveles: usa `strategy-tree`.

````md
```diagram
type: strategy-pillars
title: Plan anual
root: Excelencia tecnica
pillars:
  - name: Personas
    children: [Formacion]
  - Procesos
```
````

```diagram title="strategy-pillars"
type: strategy-pillars
title: Plan anual
root: Excelencia tecnica
pillars:
  - name: Personas
    children: [Formacion]
  - Procesos
```

### `capability-map`

Capacidades agrupadas por dominio.

**Cuando usarlo.** Para mostrar que sabe hacer una organizacion o un producto, sin hablar de tecnologia.

**Cuando no.** Si describes componentes de software: usa `component` o C4.

````md
```diagram
type: capability-map
title: Capacidades
domains:
  - name: Calidad
    capabilities: [Pruebas, Gestion de defectos]
```
````

```diagram title="capability-map"
type: capability-map
title: Capacidades
domains:
  - name: Calidad
    capabilities: [Pruebas, Gestion de defectos]
```

### `operating-model`

Capas de un modelo operativo, de negocio a infraestructura.

**Cuando usarlo.** Para relacionar niveles: negocio, procesos, aplicaciones, tecnologia.

**Cuando no.** Si solo hay una capa con elementos sueltos: usa `capability-map`.

````md
```diagram
type: operating-model
title: Modelo operativo
layers:
  - name: Negocio
    items: [Ventas]
  - name: Tecnologia
    items: [Plataforma]
```
````

```diagram title="operating-model"
type: operating-model
title: Modelo operativo
layers:
  - name: Negocio
    items: [Ventas]
  - name: Tecnologia
    items: [Plataforma]
```

### `value-chain`

Etapas encadenadas que generan valor.

**Cuando usarlo.** Para el recorrido de una actividad de principio a fin, en pasos amplios.

**Cuando no.** Si hay condiciones o vueltas atras: usa `flow` o `activity`.

````md
```diagram
type: value-chain
title: Cadena de valor
stages: [Captar, Vender, Entregar, Soportar]
```
````

```diagram title="value-chain"
type: value-chain
title: Cadena de valor
stages: [Captar, Vender, Entregar, Soportar]
```

### `before-after`

Comparacion de dos escenarios.

**Cuando usarlo.** Para justificar un cambio mostrando la situacion actual frente a la propuesta.

**Cuando no.** Si la comparacion es numerica: usa `bar` o `slope`.

Alias: `antes-despues`.

````md
```diagram
type: before-after
title: Cambio propuesto
before: [Despliegue manual]
after: [Pipeline automatico]
```
````

```diagram title="before-after"
type: before-after
title: Cambio propuesto
before: [Despliegue manual]
after: [Pipeline automatico]
```

### `matrix-2x2`

Cuatro cuadrantes con su contenido, sin coordenadas.

**Cuando usarlo.** Para clasificar en cuatro grupos cualitativos.

**Cuando no.** Si cada elemento tiene una posicion medida: usa `quadrant`.

````md
```diagram
type: matrix-2x2
title: Clasificacion
axes:
  x: Esfuerzo
  y: Impacto
quadrants: [Ganar rapido, Estrategico, Descartar, Revisar]
```
````

```diagram title="matrix-2x2"
type: matrix-2x2
title: Clasificacion
axes:
  x: Esfuerzo
  y: Impacto
quadrants: [Ganar rapido, Estrategico, Descartar, Revisar]
```

### `timeline`

Hitos en orden cronologico.

**Cuando usarlo.** Para una historia o una sucesion de hitos sin duraciones.

**Cuando no.** Si hay fechas de inicio y fin por tarea: usa `gantt`.

Alias: `linea-de-tiempo`. Si falta d2, se dibuja con mermaid.

````md
```diagram
type: timeline
title: Evolucion
phases:
  - name: 2025
    items: [Piloto]
  - name: 2026
    items: [Despliegue]
```
````

```diagram title="timeline"
type: timeline
title: Evolucion
phases:
  - name: 2025
    items: [Piloto]
  - name: 2026
    items: [Despliegue]
```

### `roadmap`

Fases futuras con su contenido.

**Cuando usarlo.** Para comunicar el plan por trimestres o fases sin comprometer fechas exactas.

**Cuando no.** Si hay compromisos de fecha: usa `gantt`.

Alias: `hoja-de-ruta`.

````md
```diagram
type: roadmap
title: Hoja de ruta
phases:
  - name: Q1
    items: [Piloto]
  - name: Q2
    items: [Adopcion]
```
````

```diagram title="roadmap"
type: roadmap
title: Hoja de ruta
phases:
  - name: Q1
    items: [Piloto]
  - name: Q2
    items: [Adopcion]
```

### `dependency-map`

Quien depende de quien.

**Cuando usarlo.** Para grafos de dependencia entre modulos, servicios o equipos, incluso con ciclos.

**Cuando no.** Si el orden temporal importa: usa `sequence`.

Alias: `dependency-graph`, `dependencias`.

````md
```diagram
type: dependency-map
title: Dependencias
dependencies:
  - api -> base de datos
  - web -> api
```
````

```diagram title="dependency-map"
type: dependency-map
title: Dependencias
dependencies:
  - api -> base de datos
  - web -> api
```

### `bpmn`

Proceso de negocio en notacion BPMN estandar.

**Cuando usarlo.** Cuando el documento va a manos de negocio o auditoria y la notacion estandar importa.

**Cuando no.** Para un proceso tecnico interno: `activity` o `flow` son mas breves. Aun no admite carriles por rol.

Alias: `proceso-de-negocio`.

````md
```diagram
type: bpmn
title: Aprobacion de solicitud
flow:
  - start: Solicitud recibida
  - task: Revisar
  - gateway: Aprobada?
    yes:
      - task: Notificar aprobacion
      - end: Aprobada
    no:
      - end: Rechazada
```
````

```diagram title="bpmn"
type: bpmn
title: Aprobacion de solicitud
flow:
  - start: Solicitud recibida
  - task: Revisar
  - gateway: Aprobada?
    yes:
      - task: Notificar aprobacion
      - end: Aprobada
    no:
      - end: Rechazada
```

### `ascii`

Dibujo hecho con caracteres, convertido a SVG limpio.

**Cuando usarlo.** Cuando ya tienes un esquema en arte ASCII —de un RFC, de un README— y quieres publicarlo legible.

**Cuando no.** Para un diagrama nuevo: cualquier tipo declarativo se mantiene mejor.

Alias: `ascii-art`, `sketch`.

````md
```diagram
type: ascii
title: Esquema
art: |
  .-------.      .------.
  | Front +----->| API  |
  '-------'      '------'
```
````

```diagram title="ascii"
type: ascii
title: Esquema
art: |
  .-------.      .------.
  | Front +----->| API  |
  '-------'      '------'
```

---

## Graficos

Se declaran en un bloque `chart`. Todos se dibujan con Vega-Lite y el resultado es un SVG estatico, sin JavaScript.

### `bar`

Comparacion entre categorias.

**Cuando usarlo.** Cuando cada barra es una categoria y quieres compararlas.

**Cuando no.** Si el eje es el tiempo y hay muchos puntos: usa `line`.

Alias: `column`.

````md
```chart
type: bar
title: Defectos por sprint
data:
  - label: SP1
    value: 42
```
````

```chart title="bar"
type: bar
title: Defectos por sprint
data:
  - label: SP1
    value: 42
```

### `horizontal-bar`

Comparacion entre categorias con etiquetas largas.

**Cuando usarlo.** Cuando los nombres no caben bajo barras verticales.

**Cuando no.** Si son pocas categorias con nombres cortos: `bar` ocupa menos.

````md
```chart
type: horizontal-bar
data:
  - label: Gestion de defectos
    value: 12
```
````

```chart title="horizontal-bar"
type: horizontal-bar
data:
  - label: Gestion de defectos
    value: 12
```

### `stacked-bar`

Composicion de un total por categoria.

**Cuando usarlo.** Para ver el total y su reparto interno a la vez.

**Cuando no.** Si quieres comparar las partes entre si: usa `grouped-bar`.

````md
```chart
type: stacked-bar
series:
  - name: Backend
    data:
      - label: SP1
        value: 10
```
````

```chart title="stacked-bar"
type: stacked-bar
series:
  - name: Backend
    data:
      - label: SP1
        value: 10
```

### `grouped-bar`

Comparacion de varias series por categoria.

**Cuando usarlo.** Cuando comparas dos o tres series dentro de cada categoria.

**Cuando no.** Si el interes es el total: usa `stacked-bar`.

````md
```chart
type: grouped-bar
series:
  - name: Plan
    data:
      - label: SP1
        value: 10
```
````

```chart title="grouped-bar"
type: grouped-bar
series:
  - name: Plan
    data:
      - label: SP1
        value: 10
```

### `line`

Evolucion de una magnitud en el tiempo.

**Cuando usarlo.** Para tendencias con varios puntos: cobertura por sprint, defectos por mes.

**Cuando no.** Con dos o tres puntos sin continuidad: usa `bar`.

````md
```chart
type: line
title: Cobertura
data:
  - label: SP1
    value: 41
```
````

```chart title="line"
type: line
title: Cobertura
data:
  - label: SP1
    value: 41
```

### `area`

Evolucion con enfasis en el volumen acumulado.

**Cuando usarlo.** Cuando importa la magnitud bajo la curva, no solo la forma.

**Cuando no.** Si comparas varias series que se cruzan: `line` se lee mejor.

````md
```chart
type: area
data:
  - label: Ene
    value: 10
```
````

```chart title="area"
type: area
data:
  - label: Ene
    value: 10
```

### `stacked-area`

Evolucion de la composicion de un total.

**Cuando usarlo.** Para ver como cambia el reparto entre series a lo largo del tiempo.

**Cuando no.** Si las series no suman un total con sentido: usa `line`.

````md
```chart
type: stacked-area
series:
  - name: Backend
    data:
      - label: Ene
        value: 10
```
````

```chart title="stacked-area"
type: stacked-area
series:
  - name: Backend
    data:
      - label: Ene
        value: 10
```

### `scatter`

Relacion entre dos magnitudes.

**Cuando usarlo.** Para buscar correlacion: tamano frente a defectos, esfuerzo frente a valor.

**Cuando no.** Si una de las dos es categorica: usa `bar`.

````md
```chart
type: scatter
data:
  - x: 120
    y: 8
```
````

```chart title="scatter"
type: scatter
data:
  - x: 120
    y: 8
```

### `heatmap`

Densidad de una magnitud en dos dimensiones categoricas.

**Cuando usarlo.** Para cruces: defectos por modulo y por sprint, actividad por dia y hora.

**Cuando no.** Si una dimension tiene un solo valor: usa `bar`.

Alias: `mapa-de-calor`.

````md
```chart
type: heatmap
data:
  - x: SP1
    y: Backend
    value: 12
```
````

```chart title="heatmap"
type: heatmap
data:
  - x: SP1
    y: Backend
    value: 12
```

### `histogram`

Distribucion de una variable continua.

**Cuando usarlo.** Para ver como se reparten los valores: duracion de las builds, tamano de las HU.

**Cuando no.** Si los valores ya vienen agrupados en categorias: usa `bar`.

````md
```chart
type: histogram
title: Duracion de builds
bins: 10
values: [4, 6, 6, 7, 9, 12]
```
````

```chart title="histogram"
type: histogram
title: Duracion de builds
bins: 10
values: [4, 6, 6, 7, 9, 12]
```

### `box-plot`

Mediana, dispersion y valores atipicos por grupo.

**Cuando usarlo.** Para comparar la variabilidad entre grupos, no solo su promedio.

**Cuando no.** Con muy pocas observaciones por grupo: la caja enganaria.

Alias: `boxplot`, `caja-bigotes`.

````md
```chart
type: box-plot
title: Duracion por equipo
groups:
  - name: Equipo A
    values: [3, 5, 6, 6, 9]
```
````

```chart title="box-plot"
type: box-plot
title: Duracion por equipo
groups:
  - name: Equipo A
    values: [3, 5, 6, 6, 9]
```

### `bullet`

Valor real frente a su objetivo.

**Cuando usarlo.** Para indicadores con meta: cobertura frente al 80 %, disponibilidad frente al SLA.

**Cuando no.** Si no hay objetivo definido: usa `bar`.

Alias: `kpi`.

````md
```chart
type: bullet
title: Indicadores
data:
  - label: Cobertura
    value: 74
    target: 80
```
````

```chart title="bullet"
type: bullet
title: Indicadores
data:
  - label: Cobertura
    value: 74
    target: 80
```

### `lollipop`

Comparacion entre categorias con menos tinta que una barra.

**Cuando usarlo.** Con muchas categorias o nombres largos: la regla fina las separa sin llenar el dibujo.

**Cuando no.** Si hay que sumar partes de un total: usa `stacked-bar`.

Alias: `dot-plot`.

````md
```chart
type: lollipop
title: Casos por modulo
sort: value
data:
  - label: SAR_Perfil_De_Riesgo
    value: 42
  - label: UAS_Gestion_De_Usuarios
    value: 27
```
````

```chart title="lollipop"
type: lollipop
title: Casos por modulo
sort: value
data:
  - label: SAR_Perfil_De_Riesgo
    value: 42
  - label: UAS_Gestion_De_Usuarios
    value: 27
```

### `sparkline`

El gesto de una serie, sin ejes y en el tamano de una frase.

**Cuando usarlo.** Junto a un numero, para decir si viene subiendo o bajando sin abrir un grafico.

**Cuando no.** Si hay que leer valores concretos: usa `line`.

Alias: `minigrafico`.

````md
```chart
type: sparkline
baseline: mean
data:
  - label: S1
    value: 12
  - label: S2
    value: 19
  - label: S3
    value: 15
```
````

```chart title="sparkline"
type: sparkline
baseline: mean
data:
  - label: S1
    value: 12
  - label: S2
    value: 19
  - label: S3
    value: 15
```

### `kpi-card`

Una fila de numeros grandes, cada uno con su etiqueta y su meta.

**Cuando usarlo.** Para abrir un informe con las tres o cuatro cifras que resumen el estado.

**Cuando no.** Para comparar entre si muchas categorias: usa `bar` o `lollipop`.

Alias: `tarjeta-kpi`, `scorecard`.

````md
```chart
type: kpi-card
data:
  - label: Cobertura
    value: 74
    unit: " %"
    target: 80
  - label: Casos disenados
    value: 312
```
````

```chart title="kpi-card"
type: kpi-card
data:
  - label: Cobertura
    value: 74
    unit: " %"
    target: 80
  - label: Casos disenados
    value: 312
```

### `calendar-heatmap`

Un periodo largo en celdas: semana en horizontal, dia en vertical.

**Cuando usarlo.** Para ver ritmo y huecos a lo largo de meses: ejecuciones por dia, defectos por dia.

**Cuando no.** Con pocos dias: una `bar` los lee mejor.

Alias: `calendario`.

````md
```chart
type: calendar-heatmap
title: Ejecuciones por dia
data:
  - date: 2026-09-01
    value: 12
  - date: 2026-09-02
    value: 31
```
````

```chart title="calendar-heatmap"
type: calendar-heatmap
title: Ejecuciones por dia
data:
  - date: 2026-09-01
    value: 12
  - date: 2026-09-02
    value: 31
```

### `bump`

Como cambia una clasificacion: quien adelanta a quien.

**Cuando usarlo.** Cuando importa la posicion relativa y no la magnitud: top de modulos por sprint.

**Cuando no.** Si lo que cambia es la magnitud: usa `line`.

Alias: `ranking-en-el-tiempo`.

````md
```chart
type: bump
title: Puesto por sprint
series:
  - name: SARLAFT
    data:
      - label: SP1
        value: 1
      - label: SP2
        value: 3
  - name: UAS
    data:
      - label: SP1
        value: 2
      - label: SP2
        value: 1
```
````

```chart title="bump"
type: bump
title: Puesto por sprint
series:
  - name: SARLAFT
    data:
      - label: SP1
        value: 1
      - label: SP2
        value: 3
  - name: UAS
    data:
      - label: SP1
        value: 2
      - label: SP2
        value: 1
```

### `slope`

Cambio entre dos momentos, elemento a elemento.

**Cuando usarlo.** Para mostrar quien mejoro y quien empeoro entre dos mediciones.

**Cuando no.** Con mas de dos momentos: usa `line`.

Alias: `slopegraph`.

````md
```chart
type: slope
title: Cobertura antes y despues
from: SP1
to: SP5
data:
  - label: Backend
    before: 41
    after: 81
```
````

```chart title="slope"
type: slope
title: Cobertura antes y despues
from: SP1
to: SP5
data:
  - label: Backend
    before: 41
    after: 81
```

### `funnel`

Caida de volumen a lo largo de etapas sucesivas.

**Cuando usarlo.** Para conversiones o filtros: candidatos por fase, incidencias por estado.

**Cuando no.** Si las etapas no son sucesivas: usa `bar`.

Alias: `embudo`.

````md
```chart
type: funnel
title: Conversion
data:
  - label: Visitas
    value: 1000
  - label: Registros
    value: 220
```
````

```chart title="funnel"
type: funnel
title: Conversion
data:
  - label: Visitas
    value: 1000
  - label: Registros
    value: 220
```

### `pie`

Reparto de un total entre pocas partes.

**Cuando usarlo.** Con tres o cuatro partes y diferencias grandes entre ellas.

**Cuando no.** Con muchas partes o valores parecidos: `bar` se compara mejor.

````md
```chart
type: pie
data:
  - label: Backend
    value: 60
```
````

```chart title="pie"
type: pie
data:
  - label: Backend
    value: 60
```

### `donut`

Reparto de un total, con el centro libre para un dato o un titulo.

**Cuando usarlo.** Igual que `pie`, cuando el hueco central aligera visualmente la lamina.

**Cuando no.** Con muchas partes o valores parecidos: `bar` se compara mejor.

Alias: `doughnut`.

````md
```chart
type: donut
data:
  - label: Backend
    value: 60
```
````

```chart title="donut"
type: donut
data:
  - label: Backend
    value: 60
```

### `waterfall`

Como se llega de un valor inicial a uno final, paso a paso.

**Cuando usarlo.** Para descomponer una variacion en sus aportes positivos y negativos.

**Cuando no.** Si solo tienes el inicio y el final: usa `bar`.

Alias: `cascada`.

````md
```chart
type: waterfall
title: Variacion de defectos
data:
  - label: Inicial
    value: 100
  - label: Corregidos
    value: -60
```
````

```chart title="waterfall"
type: waterfall
title: Variacion de defectos
data:
  - label: Inicial
    value: 100
  - label: Corregidos
    value: -60
```

---

## Arquitectura

Se declaran en un bloque `architecture`. Se dibujan con LikeC4, y si no estuviera disponible, con C4-PlantUML.

### `c4-context`

El sistema, sus usuarios y los sistemas con los que habla.

**Cuando usarlo.** Como primera vista de una arquitectura, para publico que no conoce el sistema.

**Cuando no.** Si necesitas ver piezas internas: usa `c4-container`.

Alias: `context`. Si falta likec4, se dibuja con plantuml-c4.

````md
```architecture
type: c4-context
title: Contexto
elements:
  - id: usuario
    kind: person
    name: Usuario
  - id: core
    kind: system
    name: Plataforma
relations:
  - from: usuario
    to: core
    label: Utiliza
```
````

```architecture title="c4-context"
type: c4-context
title: Contexto
elements:
  - id: usuario
    kind: person
    name: Usuario
  - id: core
    kind: system
    name: Plataforma
relations:
  - from: usuario
    to: core
    label: Utiliza
```

### `c4-container`

Las piezas desplegables del sistema y su tecnologia.

**Cuando usarlo.** Para explicar de que partes consta el sistema y como se comunican.

**Cuando no.** Si el detalle es de clases o modulos internos: usa `c4-component` o `component`.

Alias: `container`. Si falta likec4, se dibuja con plantuml-c4.

````md
```architecture
type: c4-container
title: Contenedores
elements:
  - id: plataforma
    kind: system
    name: Plataforma
  - id: api
    kind: container
    name: API
    technology: NestJS
    parent: plataforma
```
````

```architecture title="c4-container"
type: c4-container
title: Contenedores
elements:
  - id: plataforma
    kind: system
    name: Plataforma
  - id: api
    kind: container
    name: API
    technology: NestJS
    parent: plataforma
```

### `c4-component`

Componentes internos de un contenedor.

**Cuando usarlo.** Para el interior de una aplicacion concreta, cuando aporta al lector.

**Cuando no.** Casi siempre: este nivel envejece rapido. Comprueba que alguien lo vaya a leer.

Alias: `component-view`. Si falta likec4, se dibuja con plantuml-c4.

````md
```architecture
type: c4-component
title: Componentes de la API
elements:
  - id: api
    kind: container
    name: API
  - id: ctrl
    kind: component
    name: Controlador
    parent: api
```
````

```architecture title="c4-component"
type: c4-component
title: Componentes de la API
elements:
  - id: api
    kind: container
    name: API
  - id: ctrl
    kind: component
    name: Controlador
    parent: api
```

---

## Como se elige

Si dudas entre varios tipos, describe en una frase que quieres explicar y
consulta la herramienta MCP `docviz_suggest`, o ejecuta `docviz types` para
ver el catalogo con su proposito y su ejemplo.

Y antes de dibujar, comprueba que el diagrama aporta algo: para informacion
sencilla, una tabla o un parrafo comunican mejor.
