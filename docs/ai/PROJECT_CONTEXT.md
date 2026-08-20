# Contexto canónico de Parking Chía

## Identidad

- Producto visible: **Parking Chía**.
- Paquete npm: `parkingchia`.
- App ID: `com.heycarlosluis.parkingchia`.
- Repositorio: `https://github.com/heycarlosluis/parkingchia`.
- Rama principal: `main`.
- Idioma principal de la interfaz y documentación: español.
- Moneda: pesos colombianos (`COP`).

## Problema que resuelve

Parking Chía busca administrar localmente la operación cotidiana de un parqueadero: ingresos y salidas de vehículos, sesiones activas, tarifas, mensualidades, pagos, recibos, turnos de caja, impresión térmica, auditoría y reportes.

La aplicación es offline-first. Una interrupción de Internet no puede impedir el registro o la consulta de operaciones locales. La red se utiliza únicamente para actualizaciones y futuras funciones opcionales.

## Plataformas objetivo

- Windows 10 y 11, inicialmente x64, mediante instalador NSIS por usuario.
- macOS Intel y Apple Silicon, mediante DMG y ZIP.
- Node.js 22 LTS y npm para desarrollo y automatización.

Los builds de prueba pueden estar sin firma. La distribución comercial requerirá firma en Windows y firma/notarización en macOS.

## Arquitectura

```text
Renderer React
    │ window.parkingAPI: funciones concretas y tipadas
    ▼
Preload aislado
    │ canales IPC estáticos + payloads validados
    ▼
Proceso principal Electron
    ├── dominio y servicios
    ├── SQLite / Drizzle
    ├── impresión nativa
    ├── respaldos y ajustes
    └── electron-updater
```

El proceso principal es el único dueño de SQLite, del sistema de archivos y de las APIs de Electron. El renderer es una interfaz web sin privilegios de Node.js.

## Stack vigente

- Electron con electron-vite y Vite.
- React y React Router.
- TypeScript estricto.
- Zustand para estado global pequeño del renderer.
- Tailwind CSS y componentes shadcn/ui con Lucide React.
- React Hook Form, Zod y `@hookform/resolvers` para formularios validados.
- SQLite mediante `better-sqlite3` y Drizzle ORM/Kit.
- electron-builder para instaladores y electron-updater para GitHub Releases.
- ESLint, Prettier, Vitest y Testing Library.

Las versiones exactas y scripts ejecutables se consultan siempre en `package.json`; no se fijan aquí para evitar que este documento quede obsoleto en cada actualización de dependencias.

## Modelo de datos inicial

El modelo de datos comprende:

- `app_settings`
- `vehicles`
- `parking_sessions`
- `rate_plans`
- `monthly_customers`
- `monthly_subscriptions`
- `payments`
- `receipts`
- `cash_register_sessions`
- `audit_logs`
- `employees` (añadida por la migración `0005`)

Principios del modelo:

- IDs UUID de texto para entidades de dominio.
- Matrículas normalizadas en mayúsculas y con índice de búsqueda.
- Una sesión activa por vehículo y una sola caja abierta.
- Importes enteros COP y timestamps ISO 8601 UTC.
- Estados explícitos y restricciones `CHECK`.
- Relaciones con claves foráneas y borrado restrictivo.
- Recibos con número positivo único y snapshot inmutable de emisión.
- Auditoría append-only para acciones críticas.

La política de cobro (unidad por hora o minuto, tolerancia sobre la fracción, plena, moneda COP, IVA y redondeo) se guarda en `app_settings` con el prefijo `tariff.`; el cálculo vive como función pura en `src/shared/tariff.ts`.

El ciclo de parqueo es transaccional: el ingreso abre una sesión y la salida registra pago, recibo y cierre en una sola transacción. El recibo conserva un snapshot inmutable con el desglose del cobro, de modo que reimprimirlo no depende de la tarifa vigente.

Consulta `docs/database.md` y `src/main/database/schema.ts` antes de cambiar el modelo.

## Superficie IPC actual

`window.parkingAPI` permite únicamente:

- Consultar el estado de onboarding y bloqueo local.
- Completar el onboarding, editar el perfil y administrar un PIN local.
- Consultar estado de aplicación y base de datos.
- Leer la configuración de tarifas, actualizarla y administrar las tarifas por tiempo.
- Simular el cobro de una permanencia con la configuración guardada.
- Registrar el ingreso de un vehículo e imprimir su tiquete.
- Listar y buscar sesiones activas, cotizar una salida, cobrarla con recibo o anular un ingreso.
- Reimprimir el recibo de una salida ya cobrada.
- Consultar el historial de salidas por matrícula y rango de fechas.
- Administrar mensualidades: clientes, planes mensuales, suscripciones, renovaciones, cancelaciones y pagos por abono, reimprimir el comprobante de un pago y consultar la cobertura vigente de una matrícula.
- Consultar el estado de la caja, abrirla (eligiendo el empleado que opera el turno), cerrarla y anular un cobro con motivo.
- Administrar empleados: crear, listar, editar y eliminar.
- Leer y actualizar ajustes conocidos.
- Listar impresoras e imprimir un ticket de prueba.
- Crear una copia de seguridad mediante diálogo nativo.
- Consultar, buscar, descargar e instalar actualizaciones.
- Suscribirse a cambios del estado de actualización.

Los tipos están en `src/shared/contracts.ts`, los canales y esquemas en `src/shared/ipc.ts`, los handlers en `src/main/ipc/register.ts` y la exposición en `src/preload/index.ts`.

## Experiencia de usuario

La interfaz prioriza una operación rápida y con pocos errores:

- Navegación principal a Dashboard, Registrar ingreso, Parqueo activo, Historial, Mensualidades, Caja, Reportes y Configuración. Las tarifas se administran dentro de Configuración, organizada en las pestañas General, Tarifas, Impresión, Seguridad y Sistema, enlazables con `?tab=`.
- Onboarding de primera ejecución y pantalla de desbloqueo solo cuando existe un PIN.
- Navegación lateral en ventanas amplias y adaptación para espacios estrechos.
- Estados reales provenientes de IPC o estados vacíos explícitos.
- Formato monetario `es-CO`/`COP` y fechas locales al mostrar.
- Acciones financieras o destructivas explícitas, nunca implícitas.
- Accesibilidad por teclado, foco visible, semántica y movimiento reducido.

## Fuera de alcance mientras no se solicite

- Backend remoto o sincronización cloud.
- Autenticación cloud, cuentas multiusuario remotas o telemetría.
- Aplicación móvil o web pública.
- Dependencia obligatoria de Internet.
- Integración exclusiva con una marca de impresora.
- Elección automática de licencia legal.

## Definición general de terminado

Un cambio está terminado cuando el comportamiento solicitado existe de extremo a extremo, sus entradas están validadas, preserva los límites de seguridad y datos, tiene pruebas proporcionales, pasa las comprobaciones pertinentes y deja actualizada la documentación afectada. Una maqueta visual o un contrato aislado no equivale a funcionalidad terminada.
