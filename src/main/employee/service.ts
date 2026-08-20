import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { Employee } from '@shared/contracts'
import type { CreateEmployeeInput, UpdateEmployeeInput } from '@shared/employee'
import { OperationError } from '@main/ipc/errors'

type EmployeeRow = {
  id: string
  full_name: string
  document_number: string | null
  status: Employee['status']
  created_at: string
  updated_at: string
}

export class EmployeeService {
  constructor(private readonly sqlite: Database.Database) {}

  list(): Employee[] {
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM employees
         ORDER BY status = 'inactive', full_name COLLATE NOCASE`,
      )
      .all() as EmployeeRow[]
    return rows.map((row) => this.toEmployee(row))
  }

  create(input: CreateEmployeeInput): Employee {
    this.assertDocumentAvailable(input.documentNumber, null)
    const id = randomUUID()
    const now = new Date().toISOString()

    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          `INSERT INTO employees (id, full_name, document_number, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(id, input.fullName, input.documentNumber, input.status, now, now)
      this.writeAudit('employee.created', 'employee', id, now, { fullName: input.fullName })
    })()

    return this.requireEmployee(id)
  }

  update(input: UpdateEmployeeInput): Employee {
    this.requireEmployee(input.id)
    this.assertDocumentAvailable(input.documentNumber, input.id)
    const now = new Date().toISOString()

    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          `UPDATE employees
           SET full_name = ?, document_number = ?, status = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(input.fullName, input.documentNumber, input.status, now, input.id)
      this.writeAudit('employee.updated', 'employee', input.id, now, {
        fullName: input.fullName,
        status: input.status,
      })
    })()

    return this.requireEmployee(input.id)
  }

  delete(id: string): void {
    const employee = this.requireEmployee(id)
    const references = this.sqlite
      .prepare('SELECT count(*) AS total FROM cash_register_sessions WHERE employee_id = ?')
      .get(id) as { total: number }
    if (references.total > 0) {
      throw new OperationError(
        'EMPLOYEE_IN_USE',
        'Este empleado ya operó turnos de caja. Márcalo como inactivo en lugar de eliminarlo.',
      )
    }

    const now = new Date().toISOString()
    this.sqlite.transaction(() => {
      this.sqlite.prepare('DELETE FROM employees WHERE id = ?').run(id)
      this.writeAudit('employee.deleted', 'employee', id, now, { fullName: employee.fullName })
    })()
  }

  private assertDocumentAvailable(documentNumber: string | null, excludeId: string | null): void {
    if (documentNumber === null) return
    const row = this.sqlite
      .prepare(
        `SELECT id FROM employees
         WHERE document_number = ? AND (? IS NULL OR id <> ?) LIMIT 1`,
      )
      .get(documentNumber, excludeId, excludeId) as { id: string } | undefined
    if (row) {
      throw new OperationError(
        'DOCUMENT_ALREADY_USED',
        'Ya existe un empleado con ese número de documento.',
      )
    }
  }

  private requireEmployee(id: string): Employee {
    const row = this.sqlite.prepare('SELECT * FROM employees WHERE id = ?').get(id) as
      EmployeeRow | undefined
    if (!row) {
      throw new OperationError('EMPLOYEE_NOT_FOUND', 'Ese empleado ya no existe.')
    }
    return this.toEmployee(row)
  }

  private toEmployee(row: EmployeeRow): Employee {
    return {
      id: row.id,
      fullName: row.full_name,
      documentNumber: row.document_number,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private writeAudit(
    action: string,
    entityType: string,
    entityId: string,
    createdAt: string,
    details: Record<string, unknown>,
  ): void {
    this.sqlite
      .prepare(
        `INSERT INTO audit_logs (id, action, entity_type, entity_id, actor, details_json, created_at)
         VALUES (?, ?, ?, ?, 'local-operator', ?, ?)`,
      )
      .run(randomUUID(), action, entityType, entityId, JSON.stringify(details), createdAt)
  }
}
