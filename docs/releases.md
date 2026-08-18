# Versiones y releases

El proyecto usa versionado semántico. Ejemplos: `0.1.0-alpha.1`, `0.1.0-beta.1`, `0.1.0`, `0.2.0` y `1.0.0`. Una versión publicada nunca se modifica: siempre se incrementa.

## Publicar una versión

```bash
npm version prerelease --preid=alpha
npm run format:check
npm run typecheck
npm run lint
npm run test:run
npm run build
git push origin main
git push origin v0.1.0-alpha.2
```

El tag `v*` activa `release.yml`. Windows genera NSIS x64; macOS genera DMG y ZIP para x64 y arm64. Un sufijo `-alpha`, `-beta` o `-rc` crea una pre-release. Un único job publica los artefactos para evitar carreras.

Verifica en GitHub Actions que ambos builds terminaron y que el release contiene `.exe`, `.dmg`, `.zip`, `.yml` y `.blockmap`.

## Canal y firma

El canal estable `latest` es el predeterminado. Para probar pre-releases en el futuro se deberá ofrecer una preferencia explícita que active `allowPrerelease` y un canal separado; no se debe mezclar silenciosamente con producción.

Los builds iniciales no tienen firma. Windows puede mostrar SmartScreen. macOS puede bloquear o advertir sobre una app sin firma y notarización, y las actualizaciones automáticas reales en macOS requieren firma de código. Los secretos futuros (`WIN_CSC_*`, `CSC_*`, `APPLE_*`) se guardarán en GitHub Actions, nunca en el repositorio ni en el instalador.
