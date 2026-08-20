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
