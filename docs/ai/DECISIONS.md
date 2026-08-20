# Registro de decisiones arquitectónicas

Este registro conserva decisiones que deben sobrevivir a una conversación. No reemplaza ADR extensos si el proyecto los necesita en el futuro.

Estados posibles: `propuesta`, `aceptada`, `reemplazada` o `descartada`.

## D-001 — Aplicación Electron offline-first

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: construir una aplicación Electron completamente operativa sin conexión, sin backend remoto obligatorio.
- Motivo: la continuidad del parqueadero no puede depender de conectividad externa.
- Consecuencia: red, autenticación cloud, sincronización y servicios opcionales nunca deben bloquear la operación local.

## D-002 — SQLite pertenece exclusivamente al proceso principal

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: usar `better-sqlite3` y Drizzle únicamente en el proceso principal. El renderer accede mediante operaciones IPC concretas.
- Motivo: proteger el archivo, reducir privilegios y mantener una frontera auditable.
- Consecuencia: no se permiten imports de base de datos, Node.js o Electron en componentes React.

## D-003 — Preload mínimo e IPC de lista permitida

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: exponer `window.parkingAPI` mediante `contextBridge`, con canales constantes, contratos compartidos, entradas Zod y errores públicos uniformes.
- Motivo: impedir IPC arbitrario y evitar filtrar detalles internos.
- Consecuencia: cada capacidad nueva debe actualizar contrato, canal, esquema, handler, preload y pruebas como un solo cambio coherente.

## D-004 — Persistencia orientada a integridad y portabilidad

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: guardar la base bajo `app.getPath("userData")`, usar UUID de texto, UTC, enteros COP, claves foráneas, WAL y restricciones de dominio.
- Motivo: preservar datos entre actualizaciones y mantener significado consistente entre plataformas.
- Consecuencia: desarrollo usa bases separadas; el instalador y desinstalador no borran datos del usuario.

## D-005 — Migraciones versionadas con respaldo previo

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: distribuir migraciones Drizzle como recursos y crear un respaldo consistente antes de migrar una base existente.
- Motivo: una actualización no debe dejar datos irrecuperables ni un esquema parcialmente actualizado.
- Consecuencia: cambios de esquema requieren migración versionada, prueba aislada y estrategia de recuperación; no se modifica una base real con scripts de desarrollo.

## D-006 — Impresión mediante adapter independiente del fabricante

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: definir `TicketPrinter` y usar inicialmente un adapter basado en impresión nativa de Electron y tickets HTML monocromáticos.
- Motivo: permitir impresoras del sistema sin acoplar el dominio a una marca o protocolo.
- Consecuencia: ESC/POS, corte y cajón pueden añadirse como adapters futuros sin cambiar la API del renderer.

## D-007 — Actualizaciones explícitas desde GitHub Releases

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: usar electron-updater únicamente en builds empaquetados, consultar sin bloquear y requerir autorización del usuario para descargar e instalar.
- Motivo: una actualización no debe interrumpir parqueo, cobro o impresión.
- Consecuencia: desarrollo nunca consulta actualizaciones; macOS requerirá firma antes de considerar confiable la actualización automática real.

## D-008 — Distribución inicial sin firma, nunca omitiendo protecciones

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: generar artefactos de prueba sin certificados mientras el pipeline queda preparado para secretos futuros.
- Motivo: validar empaquetado antes de adquirir y configurar identidad de firma.
- Consecuencia: se documentan SmartScreen y Gatekeeper; no se recomienda desactivar permanentemente las protecciones del sistema.

## D-009 — Memoria de IA canónica y portable

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: mantener reglas comunes en `AGENTS.md`, hechos y estado en `docs/ai/`, y archivos puente mínimos para asistentes específicos.
- Motivo: permitir continuidad entre herramientas sin copiar instrucciones que después diverjan.
- Consecuencia: los adaptadores no deben adquirir reglas propias; todo cambio sustancial revisa la memoria canónica correspondiente.

## D-010 — Onboarding local con PIN opcional de 8 dígitos

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: solicitar nombre, dirección y teléfono en la primera ejecución y ofrecer un PIN local opcional de exactamente 8 dígitos, sin cuentas ni servicio remoto.
- Motivo: personalizar tickets y operación manteniendo un acceso rápido, comprensible y completamente offline.
- Consecuencia: el PIN se deriva con `scrypt` y sal aleatoria, bloquea los IPC operativos además de la interfaz y se administra desde Configuración. No existe recuperación por Internet y la interfaz debe advertirlo antes de activarlo.

## D-011 — Política tarifaria única y explícita

- Fecha: 2026-08-18
- Estado: aceptada
- Nota: la regla de gracia descrita aquí fue reemplazada por D-015. El resto sigue vigente.
- Decisión: la política de cobro vive en `app_settings` bajo el prefijo `tariff.` y contiene unidad de cobro (`hour` o `minute`), tiempo de gracia, moneda fija `COP`, IVA activable con porcentaje y modo (incluido en el precio o sumado) y redondeo del total. Cada `rate_plan` aporta precio por unidad, cobro mínimo, tope por día iniciado y una gracia propia opcional (`NULL` usa la general). El cálculo es una función pura en `src/shared/tariff.ts`.
- Motivo: el operador necesita un solo lugar donde definir cómo se cobra, y la liquidación de salidas necesita una regla reproducible y testeable antes de existir.
- Consecuencia: el orden de aplicación es unidades cobrables, tope diario, cobro mínimo, IVA y redondeo del total. Cambiar la unidad de cobro sincroniza la unidad de las tarifas por tiempo dentro de la misma transacción y exige confirmación explícita, porque los precios no se convierten. Los importes siguen siendo enteros COP.

## D-012 — Errores de dominio con mensaje público

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: `OperationError` (`src/main/ipc/errors.ts`) transporta un código y un mensaje en español pensado para el operador; cualquier otro error se sigue convirtiendo en `OPERATION_FAILED` genérico.
- Motivo: mensajes como «esta tarifa ya se usó» o el detalle de una validación son accionables, mientras que trazas y rutas internas no deben salir del proceso principal.
- Consecuencia: solo se lanza `OperationError` con texto revisado; nunca se envuelve en él un error de infraestructura.

## D-013 — Ingreso y salida como operaciones transaccionales

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: `ParkingService` resuelve el ciclo completo en el proceso principal. El ingreso crea o reutiliza el vehículo y abre la sesión; la salida recalcula el cobro, registra el pago, emite el recibo con un snapshot inmutable y cierra la sesión, todo dentro de una sola transacción SQLite. La anulación marca la sesión como `cancelled` con motivo obligatorio.
- Motivo: el cobro y el cierre no pueden quedar a medias, y el recibo debe poder reimprimirse sin recalcular una tarifa que pudo cambiar después.
- Consecuencia: una salida dentro del tiempo de gracia cierra la sesión sin pago ni recibo, porque `payments.amount_cop` exige un valor positivo. El consecutivo del recibo se calcula dentro de la transacción. La impresión ocurre después de confirmar la escritura y nunca revierte la operación: si falla, el resultado lo informa sin perder el registro.

## D-014 — El total confirmado se verifica al cobrar

- Fecha: 2026-08-18
- Estado: aceptada
- Decisión: `closeSession` recibe el total que vio el operador y lo compara con el que recalcula al momento de cerrar. Si difieren, rechaza la operación con el código `CHARGE_CHANGED` y la interfaz vuelve a cotizar.
- Motivo: entre cotizar y confirmar puede cruzarse el límite de una hora o de un minuto, y cobrar en silencio un valor distinto al mostrado rompe la confianza en la caja.
- Consecuencia: la salida usa siempre la tarifa vigente al momento de cerrar, no la del ingreso. El diálogo de salida debe cotizar contra el proceso principal antes de habilitar el cobro; el estimado que se muestra en el listado es solo informativo.

## D-015 — La gracia es una tolerancia sobre la fracción

- Fecha: 2026-08-19
- Estado: aceptada
- Reemplaza: la regla de gracia de D-011
- Decisión: cobrando por hora se cobran las horas cumplidas y la fracción final solo cuando supera la gracia. Con 5 minutos de tolerancia, salir a la hora y 5 cobra una hora y salir a la hora y 6 cobra dos. La tolerancia se vuelve a aplicar en cada salida, no solo al ingresar. Cobrando por minuto no existe fracción, así que la gracia actúa como umbral inicial.
- Motivo: es la regla real del parqueadero. La versión anterior cobraba el tiempo completo apenas se superaba la gracia inicial, de modo que una hora y diez minutos costaba dos horas.
- Consecuencia: con gracia cero el resultado equivale a redondear hacia arriba, así que el modelo anterior sigue disponible configurando 0. `ParkingCharge` expone `forgivenMinutes` para que la interfaz y el recibo expliquen qué se perdonó. La base de cálculo son minutos cumplidos (`elapsedMinutes`), no iniciados: contar minutos iniciados adelantaría el salto de hora casi un minuto y contradiría la regla en el borde.

## D-016 — La plena reemplaza el tope diario

- Fecha: 2026-08-19
- Estado: aceptada
- Reemplaza: el tope por día iniciado introducido en D-011
- Decisión: cada tarifa define el precio de su plena, el día completo, y la configuración general define el umbral de horas que la activa. Cada 24 horas cobrables cuentan como una plena; el excedente se convierte en otra plena cuando alcanza el umbral y, si no lo alcanza, se cobra por hora. Con el umbral en 10, hora a 5.000 y plena a 30.000: 9 horas cuestan 45.000, 10 horas cuestan 30.000, 33 horas cuestan 75.000 y 34 horas cuestan 60.000.
- Motivo: es la regla real del parqueadero. El tope por día iniciado que existía antes solo limitaba el total y no reproducía el umbral ni la reanudación del cobro por horas después del día.
- Consecuencia: `daily_cap_cop` se migró a `plena_cop` conservando los valores. La plena solo aplica cobrando por hora, porque el umbral se expresa en horas. La regla es un umbral, no un techo: quedarse 9 horas cuesta más que quedarse 10, y eso es intencional. Los recibos pasan a versión 2 con `plenaCount`, `plenaUnitCop` y `chargedUnits`; los de versión 1 se normalizan al reimprimirse.

## D-017 — Historial de salidas de solo lectura

- Fecha: 2026-08-19
- Estado: aceptada
- Decisión: el historial consulta sesiones cerradas y anuladas con filtro por matrícula y rango de fechas locales, y permite reimprimir cualquier recibo desde su snapshot. No modifica nada.
- Motivo: el operador necesita recuperar un recibo después de cambiar de pantalla, y hasta ahora solo podía reimprimir la última salida.
- Consecuencia: los totales se calculan sobre todo el filtro aunque la página muestre menos registros. Anular o corregir un cobro ya emitido queda para Caja, porque afecta el arqueo del turno.

## D-018 — Mensualidades con vigencia de días completos y pagos por abono

- Fecha: 2026-08-19
- Estado: aceptada
- Decisión: el módulo de Mensualidades se apoya en `monthly_customers`, `monthly_subscriptions` y los planes con `billing_unit = 'month'`. El operador elige fechas locales `AAAA-MM-DD`; `startsAt` es el comienzo del primer día cubierto y `endsAt` el comienzo del día siguiente al último, de modo que la cobertura es el intervalo semiabierto `[startsAt, endsAt)`. El estado vigente se deduce del calendario (pendiente, vigente, vencida) salvo la cancelación, que es la única decisión persistida tal cual. Una mensualidad se paga por abonos: el saldo es la diferencia entre el costo acordado y lo abonado, y cada pago emite un recibo inmutable reimprimible. Un vehículo no puede tener dos mensualidades que se crucen; renovar crea un periodo nuevo que empieza el día siguiente al último cubierto.
- Motivo: reproducir la regla real del parqueadero: el cliente paga por adelantado un periodo de días completos y su vehículo entra y sale sin cobro por horas mientras la mensualidad lo cubra. Los días completos evitan ambigüedad de horarios y la vigencia derivada impide que una mensualidad quede desactualizada tras la medianoche.
- Consecuencia: la exención se resuelve consultando cobertura por fecha en la salida (no por el estado guardado), dejando el total en cero sin ocultar la permanencia. El plan define el costo sugerido y el tipo de vehículo, sin bloquearlos al crear la mensualidad. Los pagos de mensualidad no dependen de Caja y su `cash_register_session_id` queda en `NULL` hasta que exista ese módulo. El plan `day` queda reservado para un cobro por día distinto de la plena y no se administra aquí.

## D-019 — Caja con una sola sesión abierta y arqueo en vivo

- Fecha: 2026-08-19
- Estado: aceptada
- Decisión: la caja es una sesión de turno con fondo inicial, una sola sesión abierta a la vez y cierre explícito. Cada pago de parqueo o de mensualidad se asocia, al registrarse, a la caja abierta en ese momento mediante `payments.cash_register_session_id`; si no hay caja abierta, el pago se registra igual y su campo queda en `NULL`. El arqueo se calcula en vivo como fondo inicial más lo recaudado (pagos `completed`) menos lo anulado. El cierre guarda lo contado por el operador y lo esperado, y expone la diferencia (sobrante o faltante).
- Motivo: la operación presencial necesita un solo lugar donde caigan los cobros del turno y un cierre que reconcilie lo contado contra lo esperado, sin bloquear el registro de una salida cuando por error no se abrió la caja.
- Consecuencia: un cobro solo se anula dentro de la caja abierta que lo contiene, para no alterar el arqueo inmutable de una caja ya cerrada. Anular deja `payments.status = 'voided'` y `receipts.status = 'voided'`, y no reabre la sesión de parqueo ni revierte el saldo de una mensualidad más allá de lo que deduce el propio cálculo (el abono de una mensualidad se recalcula a partir de pagos `completed`). La anulación exige motivo.

## D-020 — Empleados y turno de caja asociado

- Fecha: 2026-08-19
- Estado: aceptada
- Decisión: cada turno de caja se asocia a un empleado, administrado desde Configuración. Al abrir la caja se selecciona un empleado activo y la sesión guarda `cash_register_sessions.employee_id`; el estado y el cierre muestran su nombre.
- Motivo: el arqueo debe identificar quién operó el turno, sin recurrir a cuentas ni a autenticación remota.
- Consecuencia: un empleado con turnos registrados no se elimina, solo se desactiva; abrir caja exige un empleado activo. La caja cerrada conserva la referencia al empleado con borrado restrictivo, de modo que el historial de turnos permanece íntegro.

## D-021 — Caja abierta como requisito para operar y cierre con recibo

- Fecha: 2026-08-19
- Estado: aceptada
- Decisión: la operación monetaria exige caja abierta: no se registran ingresos, cobros de salida ni pagos de mensualidad sin una caja abierta. El cierre de caja genera un arqueo persistente que queda en un historial consultable y que se puede imprimir como recibo (empleado, fondo, recaudado, anulado, esperado, contado y diferencia).
- Motivo: sin caja abierta un cobro quedaría sin turno ni responsable, imposible de anular o conciliar; el recibo de cierre respalda el arqueo y el operador necesita recuperarlo después.
- Consecuencia: las salidas sin cobro (gracia o mensualidad) no exigen caja, pero su ingreso sí. El historial de cierres se reconstruye desde `cash_register_sessions` y sus pagos; no se crea una entidad nueva. El arqueo de una caja cerrada es inmutable.

## D-022 — Efectivo recibido obligatorio en pagos en efectivo

- Fecha: 2026-08-19
- Estado: aceptada
- Decisión: todo cobro en efectivo (salida de parqueo o pago de mensualidad) exige registrar el efectivo recibido, que debe cubrir el total, y calcula el cambio automáticamente. Los demás medios no llevan ese campo. Se valida en el esquema de entrada y se revalida en el servicio.
- Motivo: el operador siempre recibe el efectivo al cobrar; dejarlo opcional dejaba pagos sin cambio ni trazabilidad y rompía la coherencia con el arqueo de caja.
- Consecuencia: las salidas sin cobro (gracia o mensualidad) siguen sin exigir efectivo. El desglose del recibo conserva recibido y cambio como enteros COP.

## Plantilla para una nueva decisión

```markdown
## D-NNN — Título breve

- Fecha: AAAA-MM-DD
- Estado: propuesta | aceptada | reemplazada | descartada
- Reemplaza: D-NNN (si aplica)
- Decisión: qué se decidió.
- Motivo: por qué esta opción satisface las restricciones.
- Consecuencia: qué deben respetar los cambios futuros.
```
