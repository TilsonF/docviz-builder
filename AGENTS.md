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

| Necesidad | `type` |
|---|---|
| Quién habla con quién y en qué orden | `sequence` |
| Estructura de clases o entidades | `class` |
| Estados y transiciones | `state` |
| Proceso con decisiones | `activity` |
| Flujo sencillo de extremo a extremo | `flow` |
| Cronograma | `gantt` |
| Descomposición de un objetivo | `strategy-tree` |
| Causas de un problema | `issue-tree` |
| Capacidades por dominio | `capability-map` |
| Capas de un modelo operativo | `operating-model` |
| Cadena de valor | `value-chain` |
| Comparación de dos escenarios | `before-after` |
| Priorización en dos ejes | `matrix-2x2` |
| Fases en el tiempo | `roadmap` |
| Dependencias entre módulos | `dependency-map` |
| Arquitectura C4 | `c4-context`, `c4-container`, `c4-component` |
| Comparación entre categorías | `bar` |
| Evolución temporal | `line` |
| Correlación | `scatter` |
| Densidad en dos dimensiones | `heatmap` |
| Descomposición de una variación | `waterfall` |

Si no recuerdas un tipo, ejecuta `npx docviz types` o llama a la herramienta MCP
`docviz_types`.

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

Cuando un diagrama crezca demasiado, divídelo en varios con objetivos
diferentes. Un diagrama con veinte cajas no explica nada.

---

## Herramientas MCP

Si tu cliente tiene el servidor MCP de DocViz configurado, prefiérelo a ejecutar
comandos:

| Herramienta | Uso |
|---|---|
| `docviz_types` | Consultar tipos y temas disponibles |
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
