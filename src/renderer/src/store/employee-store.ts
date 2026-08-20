import { create } from 'zustand'
import type { ApiResult, Employee, EmployeeDraft } from '@shared/contracts'

type EmployeeStore = {
  employees: Employee[]
  loading: boolean
  error: string | null
  message: string
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  create: (input: EmployeeDraft) => Promise<boolean>
  update: (input: EmployeeDraft & { id: string }) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  clearFeedback: () => void
}

export const useEmployeeStore = create<EmployeeStore>((set) => {
  const load = async (): Promise<void> => {
    const result = await window.parkingAPI.listEmployees()
    if (result.ok) set({ employees: result.data, loading: false, error: null })
    else set({ loading: false, error: result.error.message })
  }

  const run = async <T>(
    operation: () => Promise<ApiResult<T>>,
    message: string,
  ): Promise<boolean> => {
    set({ error: null, message: '' })
    const result = await operation()
    if (!result.ok) {
      set({ error: result.error.message })
      return false
    }
    await load()
    set({ message })
    return true
  }

  return {
    employees: [],
    loading: true,
    error: null,
    message: '',
    initialize: async () => {
      set({ loading: true, error: null })
      await load()
    },
    refresh: load,
    create: (input) => run(() => window.parkingAPI.createEmployee(input), 'Empleado creado.'),
    update: (input) => run(() => window.parkingAPI.updateEmployee(input), 'Empleado actualizado.'),
    remove: (id) => run(() => window.parkingAPI.deleteEmployee({ id }), 'Empleado eliminado.'),
    clearFeedback: () => set({ error: null, message: '' }),
  }
})
