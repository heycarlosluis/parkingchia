# Parking Chía

Aplicación de escritorio offline-first para administrar la operación de un parqueadero. La versión `0.1.0-alpha.3` establece una base funcional y extensible: Electron, interfaz React, SQLite local, impresión térmica, respaldos, actualizaciones y distribución multiplataforma.

## Estado actual

La primera ejecución presenta un onboarding para guardar el nombre, dirección y teléfono del parqueadero. La protección con un PIN local de 8 dígitos es opcional y puede administrarse después desde Configuración. La aplicación abre una interfaz navegable con Dashboard, ingresos, salida por matrícula o lector de códigos, parqueo activo, mensualidades, caja, historial, reportes y configuración. Tarifas, cobro, recibos, cierre de caja, SQLite, IPC, impresión térmica, copias de seguridad y actualizaciones tienen implementaciones reales. Reportes continúa como base de interfaz pendiente de lógica comercial.

## Stack

- Node.js 22 LTS y npm.
- Electron + electron-vite + Vite.
- React, TypeScript estricto, React Router y Zustand.
- Tailwind CSS, shadcn/ui y Lucide React.
- React Hook Form, Zod y date-fns.
- SQLite con better-sqlite3, Drizzle ORM y Drizzle Kit.
- electron-builder y electron-updater.
- ESLint, Prettier, Vitest y Testing Library.

## Instalación y desarrollo

```bash
nvm use
npm ci
npm run dev
```

Los comandos principales son:

```bash
npm run typecheck
npm run lint
npm run lint:fix
npm run format
npm run format:check
npm run test
npm run test:run
npm run build
npm run preview
```

## Estructura

```text
drizzle/                 migraciones versionadas
scripts/                 comandos seguros de base de desarrollo
src/main/                proceso principal e infraestructura
src/preload/             API limitada para el renderer
src/renderer/            React organizado por funcionalidades
src/shared/              tipos, validaciones y helpers compartidos
docs/                    decisiones técnicas y guías operativas
.github/workflows/       CI y releases
```

Consulta [arquitectura](docs/architecture.md), [configuración inicial y acceso local](docs/onboarding.md), [base de datos](docs/database.md), [impresión](docs/printing.md) y [releases](docs/releases.md).

Para continuar el proyecto con cualquier asistente de inteligencia artificial, usa [`AGENTS.md`](AGENTS.md) y la [memoria canónica en `docs/ai/`](docs/ai/README.md). Los archivos de entrada para Claude, Gemini y GitHub Copilot remiten a esa misma fuente para evitar instrucciones divergentes.

## Base de datos y migraciones

En producción, `parkingchia.sqlite` vive bajo `app.getPath("userData")`, nunca dentro de la app, `resources`, `asar`, `dist` o temporales. La ubicación habitual es:

- Windows: `%APPDATA%/parkingchia/`
- macOS: `~/Library/Application Support/parkingchia/`

La ruta exacta puede variar según el sistema. Los valores monetarios son enteros COP y las fechas se guardan en UTC.

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

Los dos últimos comandos operan por defecto sobre `.data/parkingchia-development.sqlite`; pueden apuntar a otra base de desarrollo con `PARKINGCHIA_DEV_DB`. No apuntes esa variable a datos reales de un usuario.

La aplicación abierta con `npm run dev` usa además un `userData` separado llamado `parkingchia-development`, de modo que las pruebas manuales no tocan una instalación empaquetada.

## Configuración inicial y acceso local

En la primera ejecución se solicitan los datos básicos del parqueadero. No existen cuentas, inicio de sesión remoto ni recuperación por Internet. El PIN opcional se procesa exclusivamente en el proceso principal, se persiste como un hash `scrypt` con sal aleatoria y bloquea también las operaciones IPC, no solo la interfaz.

Desde Configuración es posible editar los datos, crear o cambiar el PIN, bloquear la aplicación inmediatamente o eliminar la protección confirmando el PIN vigente. Consulta [docs/onboarding.md](docs/onboarding.md) para el flujo y sus límites.

## Impresión

Configuración permite definir un logo, listar impresoras del sistema, escoger 58 u 80 mm y enviar un ticket de prueba. El tiquete de ingreso imprime los datos originales de la entrada, QR y Code 128; Registrar salida acepta ambos códigos desde lectores USB en modo teclado. El diálogo del sistema está activado inicialmente. Un error de driver o la ausencia de impresora devuelve un mensaje controlado sin cerrar la aplicación. Más detalles en [docs/printing.md](docs/printing.md).

## Copias de seguridad

La base pertenece al usuario. Las actualizaciones nunca deben reemplazarla y el desinstalador está configurado para conservarla. La app crea respaldos previos a las migraciones y permite guardar una copia con un diálogo nativo. Antes de una migración potencialmente destructiva debe verificarse una copia recuperable; una migración fallida no debe dejar cambios parciales.

## Empaquetado

```bash
npm run dist
npm run dist:win
npm run dist:mac
```

Windows produce un instalador NSIS por usuario para x64. macOS produce DMG y ZIP para Intel y Apple Silicon cuando el host o pipeline lo permite. Los artefactos quedan en `release/` y no se versionan.

Los primeros builds no están firmados: Windows puede mostrar SmartScreen y macOS puede bloquear o advertir sobre aplicaciones sin firma y notarización. Las actualizaciones automáticas reales en macOS requieren firma de código. No deben deshabilitarse permanentemente las protecciones del sistema; la solución es firmar y notarizar.

## Actualizaciones

En builds empaquetados, la app consulta GitHub Releases después de iniciar sin bloquear la operación y muestra el aviso en la navegación. El usuario decide cuándo descargar y cuándo reiniciar desde **Configuración > Sistema**. Si autorizó una descarga, también podrá instalarse al cerrar. Las pre-releases siguen el canal de la versión instalada y las versiones estables no reciben pruebas. En desarrollo el actualizador permanece desactivado. La ausencia de Internet no afecta las funciones del parqueadero.

El proveedor está fijado al repositorio público `heycarlosluis/parkingchia` y no contiene tokens. Consulta [docs/releases.md](docs/releases.md) para el flujo de publicación, los canales y la firma.

## Crear una release

1. Confirma primero los cambios funcionales, verifica que `git status` esté limpio y actualiza la versión sin crear todavía el tag: `npm version prerelease --preid=alpha --no-git-tag-version`.
2. Ejecuta `npm run format:check && npm run typecheck && npm run lint && npm run test:run && npm run build`.
3. Agrega `package.json` y `package-lock.json` y haz commit: `git commit -m "chore: release 0.1.0-alpha.2"`.
4. Crea el tag que coincida con `package.json`: `git tag v0.1.0-alpha.2`.
5. Sube commit y tag: `git push origin main && git push origin v0.1.0-alpha.2`.
6. Verifica el workflow `Release` en GitHub Actions.
7. Confirma que instaladores, YAML y blockmaps estén publicados.

No publiques `1.0.0` hasta que la lógica comercial y las migraciones de producción estén maduras.

## Problemas frecuentes con better-sqlite3

- **ABI o módulo incompatible:** ejecuta `npm ci` o `npx electron-builder install-app-deps` para reconstruir contra Electron.
- **Cambio de Electron:** vuelve a ejecutar el paso anterior después de actualizar Electron.
- **Herramientas de compilación faltantes:** instala Xcode Command Line Tools en macOS o Visual Studio Build Tools con C++ en Windows.
- **Base bloqueada:** confirma que no haya otra instancia; la app implementa bloqueo de instancia única.
- **Prueba con Node falla después de un rebuild:** reinstala con `npm ci`; better-sqlite3 usa binarios nativos y debe coincidir con el runtime.

## Limitaciones y próximos módulos

- Reportes todavía no tiene lógica comercial.
- Falta restauración guiada de copias; por seguridad, esta fase solo crea respaldos.
- ESC/POS, corte de papel y cajón portamonedas quedan como adapters futuros.
- No hay firma de Windows ni firma/notarización de macOS.
- Los iconos finales `.ico` e `.icns` deben añadirse antes de una distribución comercial; por ahora se conserva el icono predeterminado de Electron.
- Próximos módulos: reportes, restauración guiada y auditoría consultable.

No se agregó una licencia; esa decisión corresponde al propietario del repositorio.
