const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

export function formatCurrency(amountInPesos: number): string {
  if (!Number.isSafeInteger(amountInPesos)) {
    throw new TypeError('El valor monetario debe ser un entero seguro')
  }
  return copFormatter.format(amountInPesos)
}

/**
 * Minutos completos transcurridos entre dos marcas UTC.
 *
 * Se cuentan minutos cumplidos, no iniciados: a la hora y cinco minutos con
 * cincuenta segundos la permanencia es de 65 minutos. La tolerancia de la
 * tarifa se compara contra este valor, así que redondear hacia arriba
 * adelantaría el salto de hora casi un minuto entero.
 */
export function elapsedMinutes(startedAtUtc: string, endedAtUtc: string): number {
  const start = new Date(startedAtUtc).getTime()
  const end = new Date(endedAtUtc).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new RangeError('El intervalo de tiempo no es válido')
  }
  return Math.floor((end - start) / 60_000)
}

/**
 * Permanencia para mostrar en pantalla, tolerante a un reloj inconsistente.
 *
 * Si el reloj del equipo retrocede por debajo de la hora de ingreso, el
 * intervalo queda invertido. Un listado informativo no debe caerse por eso:
 * muestra cero y deja que el cobro real lo rechace con un mensaje accionable.
 */
export function elapsedMinutesOrZero(startedAtUtc: string, endedAtUtc: string): number {
  const start = new Date(startedAtUtc).getTime()
  const end = new Date(endedAtUtc).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0
  return Math.floor((end - start) / 60_000)
}

/** Fecha local de una marca UTC, sin la hora. */
export function formatDate(isoUtc: string): string {
  return new Date(isoUtc).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Hora local de una marca UTC, para separarla de la fecha en un listado denso. */
export function formatTime(isoUtc: string): string {
  return new Date(isoUtc).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Fecha y hora local exactas de una marca UTC, para listados y comprobantes.
 *
 * Combina día, mes, año, hora y minuto en una sola cadena, de modo que un
 * ingreso o una salida queden fechados sin ambigüedad de calendario.
 */
export function formatDateTime(isoUtc: string): string {
  return new Date(isoUtc).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
