# Herramientas MCP

## Purpose

Que un agente pueda validar, renderizar, compilar y revisar documentación
llamando a funciones tipadas, en lugar de construir líneas de comando.

## Requirements

### Requirement: DocViz se expone como herramientas, no como comandos

El proyecto **MUST** ofrecer un servidor MCP con herramientas para consultar el
catálogo de tipos, validar un documento, renderizar un diagrama suelto, compilar
la documentación y revisar el resultado.

Pedirle a un modelo que redacte `docviz build ./docs-src --output ./docs
--theme corporate` introduce una clase de errores —rutas mal escritas, opciones
inventadas— que un esquema de entrada elimina. Además, el resultado vuelve como
datos estructurados en lugar de texto que hay que interpretar.

#### Scenario: Catálogo de tipos
- **DADO** un agente que no recuerda el nombre de un tipo
- **CUANDO** invoca la herramienta de tipos
- **ENTONCES** recibe los tipos de `diagram`, `chart` y `architecture` y los temas disponibles

### Requirement: Validación de contenido en memoria

La herramienta de validación **MUST** aceptar el texto del documento
directamente, sin exigir que se haya escrito antes en disco.

El momento útil para validar es justo después de redactar y antes de guardar. Si
la única vía fuera un archivo, el agente tendría que escribir en el repositorio
para descubrir que se equivocó.

#### Scenario: Validación previa a guardar
- **DADO** un agente que acaba de redactar un documento con un bloque `chart`
- **CUANDO** valida el contenido en memoria
- **ENTONCES** recibe el número de bloques, el motor de cada uno y los errores encontrados
- **Y** no se ha escrito nada en el repositorio

### Requirement: Los errores vuelven como datos, no como excepciones

Toda herramienta **MUST** devolver un resultado con un indicador de éxito y, en
caso de fallo, el motivo y su detalle.

Una excepción que corta el transporte deja al agente sin información para
corregirse. Devolver el fallo como contenido permite reintentar con una
corrección concreta.

#### Scenario: Diagrama inválido
- **DADO** una petición de render con un tipo inexistente
- **CUANDO** se ejecuta la herramienta
- **ENTONCES** el resultado indica el fallo
- **Y** enumera los tipos válidos

### Requirement: La herramienta de render acepta intención o motor

La herramienta de render **MUST** aceptar tanto un tipo del DSL como el nombre
de un motor.

Lo habitual es que el agente declare la intención. Pero cuando necesita la vía
de escape a un lenguaje nativo, obligarle a envolverlo en un documento Markdown
solo para renderizarlo sería un rodeo innecesario.

#### Scenario: Render por intención
- **DADO** una petición con tipo `strategy-tree`
- **CUANDO** se ejecuta
- **ENTONCES** el resultado indica que el motor empleado fue D2

#### Scenario: Render por motor
- **DADO** una petición con tipo `graphviz` y una fuente DOT
- **CUANDO** se ejecuta
- **ENTONCES** el diagrama se renderiza con Graphviz

### Requirement: Las herramientas respetan la contención de rutas

Las herramientas que leen o escriben archivos **MUST** aplicar las mismas
restricciones de ruta que el resto del compilador.

Exponer el compilador como servicio no puede ampliar lo que un documento —o un
agente— alcanza en el sistema de archivos.

#### Scenario: Lectura fuera del directorio de salida
- **DADO** una petición de previsualización con una ruta que sube de directorio
- **CUANDO** se ejecuta
- **ENTONCES** se rechaza indicando que está fuera del directorio de salida
