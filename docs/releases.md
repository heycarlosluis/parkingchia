# Versiones y releases

El proyecto usa versionado semántico. Ejemplos: `0.1.0-alpha.1`, `0.1.0-beta.1`, `0.1.0`, `0.2.0` y `1.0.0`. Una versión publicada nunca se modifica: siempre se incrementa.

## Publicar una versión

```bash
git status
npm version prerelease --preid=alpha --no-git-tag-version
npm run format:check
npm run typecheck
npm run lint
npm run test:run
npm run build
git add package.json package-lock.json
git commit -m "chore: release 0.1.0-alpha.2"
git tag v0.1.0-alpha.2
git push origin main
git push origin v0.1.0-alpha.2
```

Empieza con los cambios funcionales ya revisados y confirmados en Git, y comprueba que `git status` esté limpio. Sustituye el número de ejemplo por el que haya quedado en `package.json`. `--no-git-tag-version` permite validar antes de crear el commit y el tag; no publiques con trabajo accidental o datos locales.

El tag `v*` activa `release.yml`. Windows genera NSIS x64; macOS genera DMG y ZIP para x64 y arm64. Un sufijo `-alpha`, `-beta` o `-rc` crea una pre-release. Un único job publica los artefactos para evitar carreras.

Enviar commits a `main` ejecuta CI, pero no distribuye una actualización por sí solo. `electron-updater` solo puede comparar versiones diferentes, por lo que la distribución empieza al incrementar `package.json` y enviar el tag correspondiente. El workflow rechaza un tag que no coincida exactamente con la versión y nunca reemplaza los artefactos de una versión ya publicada.

Verifica en GitHub Actions que ambos builds terminaron y que el release contiene `.exe`, `.dmg`, `.zip`, `.yml` y `.blockmap`.

### Instalador Windows de prueba desde macOS

`better-sqlite3` 13 incluye binarios precompilados por plataforma, pero `@electron/rebuild` no permite reconstruir un módulo nativo de Windows desde macOS. Para un instalador local de prueba se puede conservar el binario precompilado con:

```bash
npm run build
npx electron-builder --win nsis --x64 --publish never -c.npmRebuild=false
```

Antes de usar el resultado, verifica que `app.asar.unpacked` contenga `node_modules/better-sqlite3/prebuilds/win32-x64.node`. Este camino no reemplaza el job Windows de GitHub Actions para una release oficial ni permite ejecutar la prueba funcional del instalador en macOS.

## Canal y firma

El canal se deriva de la versión instalada. Una instalación `alpha` recibe nuevas versiones `alpha` y puede avanzar a `beta` o estable; una instalación `beta` no vuelve a `alpha`; una instalación estable solo recibe releases estables. La aplicación no fuerza manualmente `latest`, porque hacerlo impediría que una pre-release encontrara la siguiente pre-release en GitHub.

En cada inicio empaquetado la app consulta GitHub sin bloquear la operación. Si encuentra una versión más reciente, muestra un aviso persistente en la navegación que abre **Configuración > Sistema**; allí el operador la descarga y elige **Reiniciar e instalar** cuando no haya un cobro o una impresión en curso. Después de autorizar la descarga, cerrar normalmente la aplicación también deja preparada la instalación. El desarrollo local nunca consulta GitHub.

La versión `0.1.0-alpha.1` publicada el 18 de agosto de 2026 forzaba el canal estable y no puede descubrir otra pre-release. Como no registra descargas, instala en los equipos la siguiente versión publicada con esta corrección; si ya existiera una instalación de `alpha.1`, deberá actualizarse una vez con el instalador nuevo. Una futura release estable sí sería visible para `alpha.1`.

Mientras no existan credenciales, el workflow conserva builds de prueba sin firma: Windows puede mostrar SmartScreen y macOS puede bloquear o advertir sobre la app. Las actualizaciones automáticas reales en macOS requieren firma de código; para una distribución normal fuera de la App Store también se requiere notarización.

El workflow ya está preparado para leer estos secretos de GitHub Actions sin incluirlos en el repositorio ni en el instalador:

- Windows: `WIN_CSC_LINK` y `WIN_CSC_KEY_PASSWORD`.
- macOS: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` y `APPLE_TEAM_ID`.

`CSC_LINK` debe contener el certificado Developer ID Application exportado, o una referencia admitida por `electron-builder`; las tres variables `APPLE_*` permiten notarizar. Cuando se configuren, la siguiente release deberá verificarse en un equipo limpio antes de considerarla apta para distribución general.
