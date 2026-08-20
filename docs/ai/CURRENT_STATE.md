# Estado actual del proyecto

Última actualización: **2026-08-19**.

Este archivo describe el último corte conocido, no sustituye la verificación de `git status`, `package.json`, GitHub Actions ni el comportamiento ejecutable.

## Línea base

- Rama de referencia: `main`.
- Versión publicada más reciente: `0.1.0-alpha.1`.
- Tag: `v0.1.0-alpha.1`.
- CI de la línea base: aprobado.
- Release multiplataforma de la línea base: aprobada y publicada como pre-release.
- Artefactos publicados: NSIS Windows x64; DMG y ZIP macOS x64/arm64; metadatos YAML y blockmaps.

## Implementado y funcional

- Arranque de Electron con ventana única y cierre ordenado.
- Renderer React navegable con ocho secciones principales; las tarifas dejaron de ser una sección propia y ahora se administran dentro de Configuración.
- Configuración organizada en pestañas (General, Tarifas, Impresión, Seguridad y Sistema) con enlaces directos `?tab=`; la ruta `/tarifas` redirige a su pestaña.
- Onboarding de primera ejecución con nombre, dirección, teléfono y PIN opcional.
- Bloqueo local al iniciar cuando existe un PIN, con pausa tras intentos fallidos.
- Edición del perfil y creación, cambio, bloqueo inmediato o eliminación del PIN desde Configuración.
- Hash `scrypt` con sal aleatoria; el PIN nunca se persiste ni se expone en texto plano.
- Preload aislado y `window.parkingAPI` completamente tipado.
- SQLite local con migraciones Drizzle, WAL, claves foráneas y estado visible en UI.
- Esquema inicial de diez entidades con índices, relaciones y restricciones.
- Seed explícito de desarrollo con dos tarifas, un vehículo y una sesión activa.
- Módulo de tarifas completo: configuración de cobro persistida (unidad por hora o por minuto, tolerancia sobre la fracción, moneda COP, IVA activable con porcentaje y modo, redondeo del total), administración de tarifas por tipo de vehículo con precio, cobro mínimo, tope por día iniciado y gracia propia opcional, y simulador de cobro contra la configuración guardada.
- Motor de liquidación puro y testeado en `src/shared/tariff.ts`, con desglose de base, subtotal, IVA, redondeo y total en enteros COP.
- Tolerancia sobre la fracción: se cobran las horas cumplidas y la fracción final solo si supera la gracia, que se vuelve a aplicar en cada salida. El desglose informa los minutos perdonados.
- Plena: precio del día completo por tarifa y umbral de horas en la configuración general. Cada 24 horas son una plena y el excedente vuelve a cobrarse por hora hasta alcanzar de nuevo el umbral.
- Historial de salidas con filtro por matrícula y rango de fechas, totales del filtro y reimpresión de cualquier recibo desde su snapshot.
- Módulo de parqueo completo: registro de ingreso para automóviles, motocicletas, bicicletas y otros, con matrícula normalizada, tarifa sugerida por tipo de vehículo, nota opcional y tiquete de ingreso.
- Parqueo activo con búsqueda por matrícula, permanencia y estimado que se refrescan en pantalla, y anulación de un ingreso con motivo obligatorio y auditoría.
- Salida transaccional: cotización contra el proceso principal, medio de pago, efectivo recibido con cálculo de cambio, pago y recibo consecutivo con snapshot inmutable, cierre de sesión e impresión del recibo con reimpresión disponible.
- Salida dentro del tiempo de gracia que cierra la sesión sin cobro ni recibo.
- Migración `0001` que recrea `rate_plans` preservando datos y referencias, con claves foráneas desactivadas alrededor de `migrate()` y verificación posterior con `PRAGMA foreign_key_check`.
- Configuración persistente de impresora, ancho de papel y diálogo del sistema.
- Listado de impresoras y ticket HTML de prueba mediante APIs nativas de Electron.
- Respaldo manual con diálogo nativo y respaldos automáticos previos a migrar.
- Máquina de estados de actualizaciones y proveedor GitHub Releases.
- Módulo de mensualidades completo: clientes mensuales, planes con unidad `month`, suscripciones con vigencia de días completos, renovación a continuación, cancelación con motivo, pagos parciales o totales con recibo inmutable y reimprimible, y resumen de vigentes, por vencer, saldo por cobrar y recaudado del mes.
- La exención por mensualidad se integra al cobro por horas: una sesión activa cubierta por una mensualidad vigente sale con total en cero conservando la permanencia visible, y el historial marca el cliente mensual que la cubrió.
- Módulo de Caja completo: apertura con fondo inicial y empleado asignado, asociación automática de cada pago de parqueo y de mensualidad a la caja abierta, arqueo en vivo (recaudado, anulado y esperado), anulación de un cobro con motivo, cierre con efectivo contado y diferencia, recibo de cierre reimprimible e historial de cierres anteriores.
- La operación exige caja abierta: no se registran ingresos, cobros de salida ni pagos de mensualidad sin una caja abierta. Las salidas sin cobro (gracia o mensualidad) sí se permiten.
- Todo pago en efectivo exige registrar el efectivo recibido (que cubra el total) y calcula el cambio; los demás medios no requieren ese campo.
- Empleados administrados desde Configuración: crear, listar, editar, desactivar y eliminar; cada turno de caja queda asociado al empleado que lo operó.
- Empaquetado Windows/macOS, CI, publicación de tags y pre-releases.
- Pruebas de validación de matrícula, moneda, duración, esquemas IPC, onboarding, acceso local, pantalla principal, estado vacío, inicialización SQLite, actualización del esquema de tarifas preservando referencias, cálculo tarifario, servicio de tarifas, pantalla de tarifas, servicio de parqueo con ingreso, salida, anulación y numeración de recibos, plantillas de impresión, plena con los casos del parqueadero, historial de salidas, calendario y vigencia de mensualidades, servicio de mensualidades (clientes, planes, suscripciones, pagos, cobertura y resumen), servicio de caja (apertura, cierre, arqueo, anulación y asociación de pagos) y pantallas de ingreso, parqueo activo, historial, mensualidades y caja.

## Implementado como base, no como lógica comercial final

- Reportes tiene navegación y estado vacío; falta su flujo de negocio.
- Un cobro solo se anula dentro de la caja abierta que lo contiene; un cobro emitido sin caja abierta o en una caja ya cerrada no se anula desde Caja.
- Anular un cobro de parqueo no reabre la sesión ya cerrada: solo descuenta el importe del arqueo y deja el recibo anulado. Reabrir o volver a cobrar es una corrección manual del operador.
- No hay noción de cupos ni de aforo del parqueadero.
- El plan `day` del modelo no tiene pantalla ni servicio; queda reservado para un eventual cobro por día distinto de la plena.

## Validaciones conocidas de la línea base

Se verificaron correctamente:

```text
npm ci
npm run format:check
npm run typecheck
npm run lint
npm run test:run       25 archivos, 181 pruebas
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build
npm run dev
npm run dist:mac
```

El workflow de release verificó además `npm run dist:win` en Windows y `npm run dist:mac` en macOS.

## Limitaciones y riesgos conocidos

- Los instaladores todavía no están firmados. Windows puede mostrar SmartScreen y macOS puede bloquear o advertir sobre la aplicación.
- Las actualizaciones automáticas reales en macOS requieren firma de código.
- Se usa el icono predeterminado de Electron hasta disponer de `.ico` e `.icns` definitivos.
- La impresión está implementada y falla de forma controlada, pero no se ha certificado todavía con hardware térmico físico ni drivers específicos.
- No existe restauración guiada de respaldos.
- No existe recuperación remota del PIN. Es una decisión coherente con la ausencia de cuentas; deberá diseñarse una recuperación local segura antes de ofrecerla.
- ESC/POS, corte de papel y apertura de cajón son extensiones futuras.
- El módulo de tarifas administra únicamente planes por tiempo (`minute` y `hour`). Los planes `day` y `month` quedan reservados para Mensualidades y no se editan desde la pestaña Tarifas de Configuración.
- Al cambiar la unidad de cobro los precios no se convierten automáticamente; la interfaz lo advierte y exige confirmación, pero la revisión es responsabilidad del operador.
- La auditoría de npm de la línea base reportó cuatro avisos moderados en dependencias transitivas de desarrollo de Drizzle Kit y ninguno alto o crítico. No se aplicó el downgrade incompatible sugerido automáticamente.
- Las acciones oficiales de GitHub emitieron un aviso de transición de su runtime interno de Node.js, sin fallar CI ni la release; conviene actualizar sus versiones en un cambio de mantenimiento futuro.

## Próxima prioridad funcional sugerida

1. Reportes por periodo apoyados en `payments`, `receipts` y `parking_sessions`, junto con un resumen de cierres de caja por turno.
2. Reconciliar las limitaciones de anulación: decidir si anular un cobro de parqueo debe reabrir la sesión o requerir un nuevo ingreso.

La política de cobro está implementada y documentada en D-011. Falta confirmar con el propietario dos casos que hoy no cubre: pérdida de ticket y tarifas diferenciadas por franja horaria.

## Trabajo activo al cerrar este corte

El cobro en efectivo ahora exige registrar el efectivo recibido (tanto en la salida de parqueo como en el pago de mensualidad), calcula el cambio y lo valida de extremo a extremo en esquema y servicio. Los cambios pasan format, typecheck, lint, 181 pruebas y build; falta verificarlos visualmente en la aplicación en ejecución. No hay una migración, refactor o release adicional en curso documentado. Cualquier asistente debe comprobar el worktree y los procesos locales antes de asumir que sigue así.
