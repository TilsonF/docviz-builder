# Detección de bloques declarativos

## Purpose

Decidir qué partes de un documento Markdown son visualizaciones compilables y
cuáles deben quedar exactamente como están. Es la frontera entre "documento" y
"diagrama", y equivocarse en ella corrompe el documento del usuario.

## Requirements

### Requirement: Análisis sobre el AST, no con expresiones regulares

El detector **MUST** identificar los bloques recorriendo el árbol de sintaxis
(mdast) producido por `unified`/`remark`, y **MUST NOT** usar expresiones
regulares sobre el documento como mecanismo principal.

Una valla de código puede aparecer dentro de una lista, dentro de una cita, con
indentación, con vallas de longitud variable o anidada dentro de otra valla más
larga. Solo un parser real distingue esos casos; una expresión regular acaba
transformando un ejemplo de documentación —un bloque que *muestra* cómo se
escribe un diagrama— en una imagen.

#### Scenario: Bloque dentro de una lista
- **DADO** un bloque `d2` indentado como contenido de un elemento de lista
- **CUANDO** el detector recorre el documento
- **ENTONCES** lo reconoce como bloque compilable
- **Y** conserva la estructura de la lista al sustituirlo

#### Scenario: Valla anidada en un ejemplo
- **DADO** un bloque delimitado por cuatro tildes que contiene dentro un bloque de tres tildes con lenguaje `plantuml`
- **CUANDO** el detector recorre el documento
- **ENTONCES** trata el conjunto como un único bloque del lenguaje exterior
- **Y** no compila el bloque interior

### Requirement: Solo se transforman los lenguajes registrados

El detector **MUST** transformar únicamente los bloques cuyo lenguaje esté
registrado, y **MUST** dejar intacto cualquier otro bloque de código.

El documento es del autor. Un bloque `typescript`, `bash` o `json` es contenido,
no una instrucción de dibujo, y convertirlo en imagen destruiría información.

#### Scenario: Lenguaje no registrado
- **DADO** un documento con bloques `typescript`, `bash`, `json` y una valla sin lenguaje
- **CUANDO** se compila el documento
- **ENTONCES** los cuatro bloques aparecen sin cambios en la salida

#### Scenario: Renderer deshabilitado
- **DADO** un bloque `mermaid` y una configuración con `renderers.mermaid.enabled: false`
- **CUANDO** se compila el documento
- **ENTONCES** el bloque se conserva como código
- **Y** el build no falla por ello

### Requirement: Preservación del resto del documento

El compilador **MUST** conservar sin ninguna alteración todo lo que no sea un
bloque compilable: frontmatter, encabezados, listas, tablas, enlaces, imágenes
previas, HTML permitido, énfasis y espaciado.

Reserializar el AST completo normalizaría viñetas, comillas, alineación de
tablas y saltos de línea. Aunque el resultado fuera Markdown equivalente, el
`git diff` mostraría cientos de líneas cambiadas y el autor perdería el control
sobre su propio texto. Por eso la sustitución se hace por posición, cortando
exactamente el rango del bloque.

#### Scenario: Documento con formato variado
- **DADO** un documento con frontmatter, tabla alineada con `:---`, lista con viñeta `*`, lista numerada con `1)` y un bloque `mermaid`
- **CUANDO** se compila
- **ENTONCES** solo cambia el rango de texto que ocupaba el bloque `mermaid`
- **Y** el resto del archivo es idéntico byte a byte

### Requirement: Origen del texto alternativo

El detector **MUST** derivar el título del diagrama con esta prioridad: atributo
`title` de la valla, campo `title` del DSL, encabezado inmediatamente anterior
y, en último lugar, un nombre genérico según el tipo.

El título cumple dos funciones: es el texto alternativo de la imagen —requisito
de accesibilidad— y la base del nombre del archivo. Derivarlo del encabezado
anterior hace que el caso habitual no requiera escribir nada.

#### Scenario: Sin título explícito
- **DADO** un bloque `plantuml` precedido por el encabezado `## Flujo de autenticación`
- **CUANDO** se compila
- **ENTONCES** la imagen se llama `flujo-de-autenticacion-<hash>.svg`
- **Y** su texto alternativo es `Flujo de autenticación`

#### Scenario: Título explícito en la valla
- **DADO** un bloque con `title="Otro nombre"` bajo el encabezado `## Sección`
- **CUANDO** se compila
- **ENTONCES** el texto alternativo es `Otro nombre`
