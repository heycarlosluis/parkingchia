import { z } from 'zod'

const PLATE_PATTERN = /^[A-Z0-9]{3,8}$/

export function normalizePlate(value: string): string {
  return value.normalize('NFKC').toUpperCase().replace(/[\s-]/g, '')
}

export const plateSchema = z
  .string()
  .transform(normalizePlate)
  .pipe(
    z
      .string()
      .min(3, 'La matrícula debe tener al menos 3 caracteres')
      .max(8, 'La matrícula debe tener máximo 8 caracteres')
      .regex(PLATE_PATTERN, 'Usa únicamente letras y números'),
  )

export function isValidPlate(value: string): boolean {
  return plateSchema.safeParse(value).success
}
