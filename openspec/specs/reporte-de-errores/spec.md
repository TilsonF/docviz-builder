# Reporte de errores y compuerta del build

## Purpose

Que un diagrama que no se puede dibujar nunca produzca, en silencio, un
documento incorrecto.

## Requirements

### Requirement: El build falla ante un diagrama inválido

Un error de render **MUST** hacer que el proceso termine con código distinto de
cero, y **MUST NOT** escribirse ningún documento de salida cuando el modo
tolerante está desactivado.

Publicar documentación con una imagen ausente es peor que no publicarla: el
lector no sabe que falta algo. Y si el build hubiera escrito los documentos
correctos y omitido el fallido, el directorio de salida quedaría en un estado
mixto difícil de razonar.

#### Scenario: PlantUML con error de sintaxis
- **DADO** un documento con un bloque PlantUML inválido
- **CUANDO** se compila
- **ENTONCES** el proceso termina con código distinto de cero
- **Y** no se escribe el documento en el directorio de salida

### Requirement: El reporte localiza el problema

Todo error **MUST** indicar archivo, línea, renderer y motivo, y **SHOULD**
incluir el detalle textual que devolvió el motor.

"Exit code 200" no permite corregir nada. El destinatario del mensaje —una
persona revisando un pipeline, o un agente reintentando— necesita saber en qué
línea del documento está el bloque y qué le pasa.

#### Scenario: Formato del reporte
- **DADO** un bloque `plantuml` inválido en la línea 74 de `docs-src/arquitectura.md`
- **CUANDO** falla el render
- **ENTONCES** el reporte contiene el archivo, la línea 74, el renderer `plantuml` y el motivo
- **Y** incluye el mensaje original del motor

### Requirement: Los errores se acumulan antes de abortar

El build **MUST** intentar todos los bloques del proyecto y **MUST** reportar el
conjunto completo de errores encontrados, en lugar de detenerse en el primero.

Corregir errores de uno en uno, con un build completo entre cada corrección, es
un ciclo caro. Reportarlos todos permite arreglarlos en una sola pasada.

#### Scenario: Varios bloques inválidos
- **DADO** un proyecto con tres diagramas inválidos en documentos distintos
- **CUANDO** se compila
- **ENTONCES** el reporte describe los tres

### Requirement: El modo tolerante conserva el bloque original

Con `--continue-on-error` el build **MUST** escribir los documentos y **MUST**
dejar el bloque que falló tal como estaba en el fuente, además de terminar con
código distinto de cero.

Sustituir un bloque fallido por una imagen rota o eliminarlo haría que el
documento mintiera. Conservar el código fuente deja constancia visible de qué no
se pudo dibujar.

#### Scenario: Documento con un bloque válido y otro inválido
- **DADO** un documento con un `d2` válido y un `graphviz` inválido
- **CUANDO** se compila con `--continue-on-error`
- **ENTONCES** el `d2` aparece como imagen
- **Y** el `graphviz` aparece como bloque de código
- **Y** el proceso termina con código distinto de cero

### Requirement: Validación previa sin renderizar

El sistema **MUST** ofrecer una comprobación que valide lenguaje, DSL y
disponibilidad del renderer sin dibujar nada.

Arrancar una JVM y un Chromium para descubrir que el autor escribió `type:
mandala` es desperdiciar medio minuto. La compuerta rápida detecta la mayoría de
los errores de escritura en menos de un segundo y encaja en un hook de
pre-commit.

#### Scenario: Comprobación de un proyecto correcto
- **DADO** un proyecto cuyos bloques son todos interpretables
- **CUANDO** se ejecuta la comprobación
- **ENTONCES** termina con código cero
- **Y** no se invoca ningún motor de render

#### Scenario: Comprobación con un DSL inválido
- **DADO** un bloque `chart` con un tipo inexistente
- **CUANDO** se ejecuta la comprobación
- **ENTONCES** falla indicando archivo, línea y valores válidos
