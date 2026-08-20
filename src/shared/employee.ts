import { z } from 'zod'

/**
 * Dominio de empleados de Parking Chía.
 *
 * Un empleado es quien opera un turno de caja. Se administra desde Configuración
 * y se asocia a la caja al abrirla. Aquí viven únicamente los contratos de
 * entrada; la persistencia y la auditoría viven en el proceso principal.
 */

export type EmployeeStatus = 'active' | 'inactive'

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
}

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} es demasiado largo`)
    .nullable()
    .transform((value) => (value === null || value === '' ? null : value))

export const employeeIdSchema = z.string().trim().min(1).max(64)

const employeeShape = {
  fullName: z
    .string()
    .trim()
    .min(3, 'El nombre del empleado es obligatorio')
    .max(80, 'El nombre del empleado es demasiado largo'),
  documentNumber: optionalText(20, 'El documento'),
  status: z.enum(['active', 'inactive']),
}

export const createEmployeeSchema = z.object(employeeShape).strict()

export const updateEmployeeSchema = z.object({ id: employeeIdSchema, ...employeeShape }).strict()

export const deleteEmployeeSchema = z.object({ id: employeeIdSchema }).strict()

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>
