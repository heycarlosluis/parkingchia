import { Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Employee } from '@shared/contracts'
import { EMPLOYEE_STATUS_LABELS } from '@shared/employee'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { EmployeeDialog } from '@/features/settings/employee-dialog'
import { useEmployeeStore } from '@/store/employee-store'

export function EmployeesSettings(): React.JSX.Element {
  const employees = useEmployeeStore((store) => store.employees)
  const loading = useEmployeeStore((store) => store.loading)
  const error = useEmployeeStore((store) => store.error)
  const message = useEmployeeStore((store) => store.message)
  const initialize = useEmployeeStore((store) => store.initialize)
  const createEmployee = useEmployeeStore((store) => store.create)
  const updateEmployee = useEmployeeStore((store) => store.update)
  const removeEmployee = useEmployeeStore((store) => store.remove)
  const clearFeedback = useEmployeeStore((store) => store.clearFeedback)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [removing, setRemoving] = useState<Employee | null>(null)

  useEffect(() => {
    void initialize()
  }, [initialize])

  const openDialog = (employee: Employee | null): void => {
    clearFeedback()
    setEditing(employee)
    setDialogOpen(true)
  }

  const confirmRemove = async (): Promise<void> => {
    if (!removing) return
    const removed = await removeEmployee(removing.id)
    if (removed) setRemoving(null)
  }

  return (
    <>
      <div className="stable-status" role="status" aria-live="polite">
        {message}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>La operación no se completó</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="sessions-toolbar">
          <div>
            <CardTitle className="title-with-icon">
              <UserRound aria-hidden="true" /> Empleados
            </CardTitle>
            <CardDescription>
              Quien abre una caja se asocia a su turno y queda en el arqueo.
            </CardDescription>
          </div>
          <div className="sessions-toolbar-actions">
            <Button type="button" onClick={() => openDialog(null)}>
              <Plus data-icon="inline-start" />
              Nuevo empleado
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="field-hint">Consultando los empleados…</p>
          ) : employees.length === 0 ? (
            <Empty className="module-empty border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UserRound aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Todavía no hay empleados</EmptyTitle>
                <EmptyDescription>
                  Registra al personal para poder elegir quién abre cada turno de caja.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <caption className="sr-only">
                  Empleados con su documento, estado y acciones disponibles.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Empleado</th>
                    <th scope="col">Documento</th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="actions">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id} data-inactive={employee.status === 'inactive'}>
                      <th scope="row">{employee.fullName}</th>
                      <td className="tabular">{employee.documentNumber ?? '—'}</td>
                      <td>
                        <Badge variant={employee.status === 'active' ? 'default' : 'outline'}>
                          {EMPLOYEE_STATUS_LABELS[employee.status]}
                        </Badge>
                      </td>
                      <td className="actions">
                        <div className="row-actions">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openDialog(employee)}
                          >
                            <Pencil data-icon="inline-start" />
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              clearFeedback()
                              setRemoving(employee)
                            }}
                          >
                            <Trash2 data-icon="inline-start" />
                            Eliminar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EmployeeDialog
        open={dialogOpen}
        employee={editing}
        error={error}
        onOpenChange={setDialogOpen}
        onSubmit={(draft) =>
          editing ? updateEmployee({ ...draft, id: editing.id }) : createEmployee(draft)
        }
      />

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar a {removing?.fullName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Un empleado que ya operó turnos de caja no se puede eliminar; en ese caso desactívalo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void confirmRemove()
              }}
            >
              Eliminar empleado
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
