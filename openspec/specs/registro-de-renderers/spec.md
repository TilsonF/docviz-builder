# Registro de renderers

## Purpose

Que añadir, sustituir o desactivar un motor de dibujo no obligue a tocar el
parser, el orquestador ni ninguna otra parte del compilador.

## Requirements

### Requirement: El parser no conoce ningún motor

El detector de bloques **MUST** consultar el registro para saber qué lenguajes
son compilables, y **MUST NOT** importar ningún renderer concreto.

Si el parser supiera qué es PlantUML, cada motor nuevo obligaría a modificarlo,
y con él a revalidar todo el comportamiento de preservación del documento —la
parte más delicada del sistema.

#### Scenario: Renderer adicional en tiempo de ejecución
- **DADO** un registro con un renderer propio registrado bajo un lenguaje nuevo
- **CUANDO** se analiza un documento con ese lenguaje
- **ENTONCES** el bloque se detecta como compilable
- **Y** no hubo que modificar el parser

### Requirement: Contrato uniforme de renderer

Todo renderer **MUST** exponer su tipo, sus formatos soportados, una versión
identificable y una operación de render que reciba fuente y opciones.

La versión no es informativa: entra en el hash del recurso, de modo que
actualizar un motor invalide automáticamente sus imágenes. Sin ella, una
actualización dejaría publicadas imágenes generadas por la versión anterior.

#### Scenario: Formato no soportado
- **DADO** un renderer que solo produce SVG
- **CUANDO** se le pide PNG
- **ENTONCES** falla indicando los formatos que sí soporta

### Requirement: Alias de lenguaje

El registro **MUST** aceptar alias hacia el tipo canónico y resolverlos al
registrar y al consultar.

`dot` y `graphviz` son el mismo lenguaje, igual que `puml` y `plantuml`. Que el
autor escriba el nombre que conoce, y no el que eligió el compilador, evita
errores triviales.

#### Scenario: Alias conocido
- **DADO** un bloque con lenguaje `dot`
- **CUANDO** se resuelve el renderer
- **ENTONCES** se obtiene el renderer canónico `graphviz`

### Requirement: Cada motor puede desactivarse

La configuración **MUST** permitir deshabilitar cualquier renderer de forma
individual.

Una máquina de integración continua sin Java o sin navegador debe poder compilar
la documentación que no usa esos motores, en lugar de fallar por completo.

#### Scenario: Entorno sin navegador
- **DADO** una configuración con `renderers.mermaid.enabled: false`
- **CUANDO** se construye el registro
- **ENTONCES** `mermaid` no figura entre los lenguajes compilables
- **Y** el resto de motores funciona con normalidad

### Requirement: Backend intercambiable por motor

La configuración **MUST** permitir elegir entre el motor local y Kroki, tanto de
forma global como por motor concreto.

Una organización puede tener un Kroki con PlantUML corporativo pero preferir el
D2 local. Forzar todo o nada obligaría a renunciar a uno de los dos.

#### Scenario: Backend mixto
- **DADO** `renderers.backend: local` y `renderers.d2.backend: kroki`
- **CUANDO** se construye el registro
- **ENTONCES** D2 se resuelve contra Kroki
- **Y** los demás motores se resuelven en local

### Requirement: LikeC4 es un renderer especializado

LikeC4 **MUST** resolverse siempre con su renderer propio, con independencia del
backend configurado.

Kroki no cubre LikeC4, y su exportación oficial exige un navegador con
Playwright. El renderer propio calcula el layout con la API programática y dibuja
el SVG aplicando el tema del proyecto, lo que además da un resultado coherente
con el resto de motores.

#### Scenario: Backend global Kroki
- **DADO** `renderers.backend: kroki`
- **CUANDO** se construye el registro
- **ENTONCES** LikeC4 sigue resolviéndose con su renderer especializado
