# Qué licencias hereda quien instala DocViz

DocViz es MIT, pero un paquete no se instala solo. Esto es lo que entra en
`node_modules` con él y qué obliga cada cosa.

> **No se escribe a mano**: lo genera `node scripts/licencias.mjs` recorriendo
> el árbol de producción real. Una dependencia nueva con una licencia que el
> script no sepa clasificar hace fallar la comprobación, para que nadie la
> apruebe por descuido.

Dependencias de producción: **309**.

| Familia | Paquetes | Qué obliga |
|---|---|---|
| permisiva | 304 | Conservar el aviso de copyright. Nada más. |
| copyleft debil | 3 | Por archivo. Ver abajo. |
| con clausula propia | 1 | No es estándar. Ver abajo. |
| dominio publico | 1 | Nada. |

## Las que piden algo más que atribución

### `@terrastruct/d2` — MPL-2.0

por archivo: usarla como libreria sin modificarla es compatible con distribuir MIT; si se modifica un archivo suyo, ese archivo sigue siendo MPL

### `bpmn-js` — SEE LICENSE IN LICENSE

hay que leer su archivo de licencia: no es una licencia estandar

### `lightningcss` — MPL-2.0

por archivo: usarla como libreria sin modificarla es compatible con distribuir MIT; si se modifica un archivo suyo, ese archivo sigue siendo MPL

### `lightningcss-darwin-arm64` — MPL-2.0

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
