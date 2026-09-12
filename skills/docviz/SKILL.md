---
name: docviz
description: Genera diagramas y gráficos dentro de documentación Markdown declarando la intención (secuencia, flujo, arquitectura C4, barras, tendencia…) en lugar de escribir PlantUML, Mermaid, D2 o Vega-Lite a mano. Úsalo siempre que vayas a dibujar algo en un documento, cuando dudes qué tipo de diagrama encaja, o cuando un bloque de diagrama no compile. Todo se renderiza en local y la salida es Markdown estándar con imágenes SVG, así que se ve igual en GitHub, en un wiki o en un PDF.
---

# DocViz — diagramas como código dentro de Markdown

Escribes **qué quieres explicar**; DocViz elige el motor y devuelve Markdown
portable con la imagen ya generada. No escribas PlantUML, Mermaid, D2, Graphviz,
Vega-Lite ni LikeC4 a mano: cada visor soporta un subconjunto distinto y el
resultado deja de verse según dónde se lea.

## Las tres vallas

| Valla | Cuándo |
|---|---|
| `diagram` | Interacción, flujo, estados, dependencias, análisis estratégico |
| `chart` | Comparación cuantitativa, tendencia, distribución |
| `architecture` | Modelo C4 |

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

`->` es un mensaje, `-->` una respuesta.

## No adivines el tipo — pregunta

Hay 57 tipos. Antes de escribir un bloque, si no estás seguro:

```bash
npx docviz suggest "el proceso de aprobación de una solicitud"   # recomienda el tipo
npx docviz types                                                 # catálogo con su propósito
npx docviz types sequence                                        # ficha y ejemplo que compila tal cual
```

`docviz types <tipo>` imprime el esqueleto mínimo del tipo. Cópialo y rellénalo:
es la forma más rápida de no equivocarte de campo.

## Flujo de trabajo

```bash
npx docviz check docs-src                     # valida sin dibujar (rápido)
npx docviz build docs-src --output docs       # compila a Markdown + SVG
npx docviz verify docs                        # comprueba que no haya imágenes rotas
npx docviz diff <docs-src anterior> docs-src  # qué diagramas cambiaron
```

No des la tarea por terminada mientras `check` o `verify` fallen.

## Cuando algo falla

Cada error trae un **código** además de archivo y línea. Léelo, no adivines:

| Código | Qué hacer |
|---|---|
| `DV101` | Falta un campo obligatorio; el detalle dice cuál |
| `DV102` | El campo está con la forma equivocada (lista donde iba mapa, o al revés) |
| `DV103` | El valor no es uno de los admitidos; el detalle los enumera |
| `DV104` | Escribiste un campo que ese tipo no usa. Si te propone otro nombre, es una errata |
| `DV105` | El bloque no es YAML válido; suele ser la indentación |
| `DV106` | El `type` no existe o va en otra valla; usa `docviz suggest` |
| `DV005` | Falta Java o Chromium en la máquina. No cambies el diagrama: dilo |

Un documento con varios bloques rotos los reporta **todos a la vez**:
arréglalos en una sola pasada.

Un `AVISO ... [DV104]` no rompe el build, pero significa que un campo que
escribiste no llegó al dibujo. O sobra, o está mal escrito; en ningún caso se
ignora.

## Reglas

- Modifica los documentos fuente; nunca el directorio de salida ni `assets/generated`.
- No generes SVG o PNG a mano si DocViz puede generarlos.
- No fijes colores: el tema trae su equivalente en modo oscuro y un color escrito
  a mano pierde esa propiedad.
- No sustituyas un diagrama declarativo por una captura de pantalla.
- Antes de dibujar, comprueba que aporta algo: para información sencilla, una
  tabla o un párrafo comunican mejor. Un diagrama de veinte cajas no explica
  nada — divídelo.

## Primera vez en un proyecto

```bash
npm install -D @tilsonf/docviz-builder
npx docviz setup    # descarga plantuml.jar (única operación de red)
npx docviz init     # configuración, AGENTS.md y un documento de ejemplo
npx docviz doctor   # qué motores puede usar esta máquina
```

`docviz init` deja un `AGENTS.md` con el catálogo completo de los 57 tipos y sus
tablas de decisión. Consúltalo cuando necesites el detalle que este resumen no
trae.
