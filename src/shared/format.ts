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

export function durationMinutes(startedAtUtc: string, endedAtUtc: string): number {
  const start = new Date(startedAtUtc).getTime()
  const end = new Date(endedAtUtc).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new RangeError('El intervalo de tiempo no es válido')
  }
  return Math.ceil((end - start) / 60_000)
}
