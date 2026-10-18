# Qué licencias hereda quien instala DocViz

DocViz es MIT, pero un paquete no se instala solo. Esto es lo que entra en
`node_modules` con él y qué obliga cada cosa.

> **No se escribe a mano**: lo genera `node scripts/licencias.mjs` recorriendo
> el árbol de producción real. Una dependencia nueva con una licencia que el
> script no sepa clasificar hace fallar la comprobación, para que nadie la
> apruebe por descuido.

Dependencias de producción: **306**, sin contar los binarios
por plataforma —`esbuild`, `lightningcss`, `rolldown`, `fsevents`— de los que
cada máquina instala el suyo. Esos se clasifican igual, pero no se listan:
su licencia es la de su paquete padre, y listarlos haría que este documento
dependiera del ordenador que lo generó.

| Familia | Paquetes | Qué obliga |
|---|---|---|
| permisiva | 301 | Conservar el aviso de copyright. Nada más. |
| copyleft debil | 3 | Solo si modificas la libreria. Ver abajo. |
| con clausula propia | 1 | No es estándar. Ver abajo. |
| dominio publico | 1 | Nada. |

## Las que piden algo más que atribución

### `@terrastruct/d2` — MPL-2.0

por archivo: usarla como libreria sin modificarla es compatible con distribuir MIT; si se modifica un archivo suyo, ese archivo sigue siendo MPL

### `bpmn-js` — SEE LICENSE IN LICENSE

hay que leer su archivo de licencia: no es una licencia estandar

### `elkjs` — EPL-2.0

por modulo: usarla como libreria sin modificarla no afecta al codigo propio; si se modifica, hay que publicar la fuente de lo modificado bajo EPL-2.0

### `lightningcss` — MPL-2.0

por archivo: usarla como libreria sin modificarla es compatible con distribuir MIT; si se modifica un archivo suyo, ese archivo sigue siendo MPL

## Lo que eso significa en la práctica

- **`@terrastruct/d2`** es el motor de los diagramas D2, y es MPL-2.0. Mientras
  se use como librería sin modificar sus archivos —que es lo que hace DocViz—,
  distribuir bajo MIT es compatible.
- **`bpmn-js`** es MIT **más una cláusula**: el código que muestra la marca de
  agua de bpmn.io no se puede quitar ni cambiar. DocViz no lo toca: usa su
  propio `saveSVG()`, que no la incluye por diseño de bpmn.io. La obligación
  viaja con el paquete, así que conviene saberlo antes de modificar nada de su
  trazado.
- **`lightningcss`** llega a través de `likec4`. Si prescindes de LikeC4
  —ver el README—, sale del árbol y con él sus dos entradas MPL.
- **`elkjs`** llega a través de `mermaid` y es la única EPL-2.0 del árbol. Es
  copyleft **por módulo**: obliga a publicar la fuente de lo que se modifique
  de ella, no la del código que la usa. DocViz no la modifica, no la empaqueta
  —el `.tgz` publicado no lleva `node_modules`, y la compilación es `tsc`, no un
  empaquetador que fundiría su código con el nuestro— y quien instala la trae de
  su propio registro. El único caso que cambiaría esto es empaquetar DocViz en un
  solo archivo: ahí el resultado sería una obra combinada y habría que mantener
  identificables los archivos EPL.
- No elige la licencia secundaria GPL: su cabecera declara
  `SPDX-License-Identifier: EPL-2.0` y nada más. El «Anexo A» que aparece en su
  `LICENSE.md` es parte del texto estándar de la EPL, no una elección —el propio
  texto dice que incluirlo no basta para licenciar bajo las secundarias—.
