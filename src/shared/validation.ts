import { z } from 'zod'

export const MIN_PLATE_LENGTH = 3
export const MAX_PLATE_LENGTH = 8

const PLATE_PATTERN = new RegExp(`^[A-Z0-9]{${MIN_PLATE_LENGTH},${MAX_PLATE_LENGTH}}$`)

export function normalizePlate(value: string): string {
  return value.normalize('NFKC').toUpperCase().replace(/[\s-]/g, '')
}

/**
 * Matrícula tal como debe quedar mientras se escribe.
 *
 * Descarta todo lo que no sea una letra sin tilde o un dígito y corta en el
 * largo máximo, de modo que el campo no llegue nunca a un valor que el esquema
 * tendría que rechazar después. Las tildes y la eñe se reducen a su letra base
 * en lugar de borrarse: un acento en una matrícula es un desliz del teclado,
 * no una letra distinta.
 */
export function sanitizePlateInput(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, MAX_PLATE_LENGTH)
}

export const plateSchema = z
  .string()
  .transform(normalizePlate)
  .pipe(
    z
      .string()
      .min(MIN_PLATE_LENGTH, `La matrícula debe tener al menos ${MIN_PLATE_LENGTH} caracteres`)
      .max(MAX_PLATE_LENGTH, `La matrícula debe tener máximo ${MAX_PLATE_LENGTH} caracteres`)
      .regex(PLATE_PATTERN, 'Usa únicamente letras y números'),
  )

export function isValidPlate(value: string): boolean {
  return plateSchema.safeParse(value).success
}
