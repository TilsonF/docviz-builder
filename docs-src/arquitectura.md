---
title: Arquitectura de DocViz Builder
---

# Arquitectura de DocViz Builder

DocViz Builder convierte bloques declarativos escritos dentro de Markdown en
imágenes SVG, y reescribe el documento para que quede como **Markdown estándar y
portable**: quien lo lee no necesita saber que existieron PlantUML, Mermaid, D2,
Vega-Lite, Graphviz ni LikeC4.

## Capas

```architecture
type: c4-container
title: Contenedores de DocViz Builder

elements:
  - id: agente
    kind: person
    name: Agente o autor
    description: Escribe Markdown con bloques declarativos

  - id: docviz
    kind: system
    name: DocViz Builder
    color: primary

  - id: cli
    kind: container
    name: CLI
    description: build, check, verify y preview
    technology: commander
    parent: docviz

  - id: parser
    kind: container
    name: Parser Markdown
    description: Detecta bloques sobre el AST, nunca con expresiones regulares
    technology: unified / remark
    parent: docviz

  - id: dsl
    kind: container
    name: Compilador del DSL
    description: diagram, chart y architecture hacia el motor adecuado
    parent: docviz

  - id: registry
    kind: container
    name: Renderer Registry
    description: Resuelve el motor de cada lenguaje
    parent: docviz

  - id: motores
    kind: component
    name: Motores
    description: PlantUML, Mermaid, D2, Vega-Lite, Graphviz, LikeC4
    parent: docviz

  - id: cache
    kind: database
    name: Caché de recursos
    description: Clave SHA256 de fuente, tema y versión del motor
    parent: docviz

  - id: salida
    kind: storage
    name: docs/ + assets/generated
    description: Markdown compilado e imágenes

relations:
  - from: agente
    to: cli
    label: Ejecuta docviz build
  - from: cli
    to: parser
    label: Recorre los documentos
  - from: parser
    to: dsl
    label: Compila el DSL de alto nivel
  - from: dsl
    to: registry
    label: Pide el renderer
  - from: registry
    to: motores
    label: Delega el dibujo
  - from: registry
    to: cache
    label: Consulta antes de dibujar
  - from: cli
    to: salida
    label: Escribe Markdown y recursos
```

## Recorrido de un bloque

```diagram
type: sequence
title: Del bloque declarativo a la imagen

participants:
  - name: Documento
    type: boundary
  - Parser
  - Registry
  - Caché
  - Motor
  - name: assets/generated
    type: database

flow:
  - Documento -> Parser: bloque `diagram`
  - Parser -> Registry: tipo resuelto
  - Registry -> Caché: hash(fuente, tema, versión)
  - Caché --> Registry: acierto o fallo
  - Registry -> Motor: renderiza si falló el caché
  - Motor --> Registry: SVG
  - Registry -> assets/generated: escribe el recurso
  - assets/generated --> Documento: ruta relativa
```

## Estados de un recurso

```diagram
type: state
title: Ciclo de vida de un recurso generado

states:
  - name: Declarado
    description: Existe como bloque en docs-src
  - name: En caché
    description: Su hash ya fue renderizado antes
  - name: Renderizado
  - name: Publicado
    description: Copiado a assets/generated

initial: Declarado

transitions:
  - Declarado -> En caché: hash conocido
  - Declarado -> Renderizado: hash nuevo
  - Renderizado -> En caché: se guarda
  - En caché -> Publicado: se copia
  - Renderizado -> Publicado: se copia
  - Publicado -> Declarado: cambia la fuente, el tema o el motor
```

## Dependencias internas

```diagram
type: dependency-map
title: Dependencias entre módulos
direction: lr

dependencies:
  - cli -> builder
  - builder -> parser
  - builder -> dsl
  - builder -> registry
  - builder -> cache
  - builder -> paths
  - registry -> renderers
  - renderers -> themes
  - dsl -> themes
  - builder --> verify: comprueba la salida
```

## Decisiones de diseño

| Decisión | Motivo |
|---|---|
| Reemplazo por posición en lugar de reserializar | Reserializar con `remark-stringify` normalizaría viñetas, comillas y saltos; el criterio de aceptación exige mantener intacto el resto del Markdown |
| Motores locales por defecto | La documentación puede ser confidencial: nada sale del proceso salvo que se configure un Kroki propio |
| El hash incluye el tema y la versión del motor | Cambiar un color o actualizar PlantUML debe invalidar las imágenes afectadas, no todas |
| Emisor SVG propio para LikeC4 | La exportación oficial exige un navegador con Playwright; el emisor propio mantiene LikeC4 tan offline como el resto y respeta el tema |
| Identificadores del SVG renumerados | Vega mantiene un contador global por proceso: sin renumerar, el mismo gráfico produce bytes distintos y el caché deja de ser determinista |
