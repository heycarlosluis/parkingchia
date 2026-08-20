// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseManager } from '@main/database/connection'
import { CashService } from '@main/cash/service'
import { EmployeeService } from './service'

let directory = ''
let manager: DatabaseManager
let service: EmployeeService
let cash: CashService

const draft = {
  fullName: 'Laura Torres',
  documentNumber: '1012345678',
  status: 'active' as const,
}

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'parkingchia-employees-'))
  manager = new DatabaseManager(path.join(directory, 'test.sqlite'), path.resolve('drizzle'))
  manager.initialize()
  service = new EmployeeService(manager.getNativeConnection())
  cash = new CashService(manager.getNativeConnection())
})

afterEach(() => {
  manager.close()
  fs.rmSync(directory, { recursive: true, force: true })
})

describe('empleados', () => {
  it('crea, lista y edita empleados', () => {
    const employee = service.create(draft)
    expect(employee).toMatchObject({ fullName: 'Laura Torres', status: 'active' })

    const updated = service.update({ ...draft, id: employee.id, status: 'inactive' })
    expect(updated.status).toBe('inactive')
    expect(service.list()).toHaveLength(1)
  })

  it('rechaza dos empleados con el mismo documento', () => {
    service.create(draft)
    expect(() => service.create({ ...draft, fullName: 'Otro empleado' })).toThrow(
      expect.objectContaining({ code: 'DOCUMENT_ALREADY_USED' }),
    )
  })

  it('no elimina un empleado que ya operó una caja', () => {
    const employee = service.create(draft)
    cash.openSession({ employeeId: employee.id, openingAmountCop: 0, notes: null })

    expect(() => service.delete(employee.id)).toThrow(
      expect.objectContaining({ code: 'EMPLOYEE_IN_USE' }),
    )
  })

  it('elimina un empleado sin historial', () => {
    const employee = service.create({ ...draft, documentNumber: null })
    service.delete(employee.id)
    expect(service.list().map((item) => item.id)).not.toContain(employee.id)
  })
})
