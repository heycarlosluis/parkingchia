import { Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import { useState } from 'react'
import type { MonthlyCustomer } from '@shared/contracts'
import { CUSTOMER_STATUS_LABELS } from '@shared/monthly'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { CustomerDialog } from '@/features/monthly/customer-dialog'
import { useMonthlyStore } from '@/store/monthly-store'

export function CustomersCard(): React.JSX.Element {
  const customers = useMonthlyStore((store) => store.customers)
  const loading = useMonthlyStore((store) => store.loading)
  const error = useMonthlyStore((store) => store.error)
  const createCustomer = useMonthlyStore((store) => store.createCustomer)
  const updateCustomer = useMonthlyStore((store) => store.updateCustomer)
  const deleteCustomer = useMonthlyStore((store) => store.deleteCustomer)
  const clearFeedback = useMonthlyStore((store) => store.clearFeedback)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MonthlyCustomer | null>(null)
  const [removing, setRemoving] = useState<MonthlyCustomer | null>(null)

  const openDialog = (customer: MonthlyCustomer | null): void => {
    clearFeedback()
    setEditing(customer)
    setDialogOpen(true)
  }

  const confirmRemove = async (): Promise<void> => {
    if (!removing) return
    const removed = await deleteCustomer(removing.id)
    if (removed) setRemoving(null)
  }

  return (
    <>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>La operación no se completó</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="sessions-toolbar">
          <CardTitle className="title-with-icon">
            <UserRound aria-hidden="true" /> {customers.length}{' '}
            {customers.length === 1 ? 'cliente' : 'clientes'}
          </CardTitle>
          <div className="sessions-toolbar-actions">
            <Button type="button" onClick={() => openDialog(null)}>
              <Plus data-icon="inline-start" />
              Nuevo cliente
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="field-hint">Consultando los clientes…</p>
          ) : customers.length === 0 ? (
            <Empty className="module-empty border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UserRound aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Todavía no hay clientes mensuales</EmptyTitle>
                <EmptyDescription>
                  Registra al cliente antes de crear su mensualidad. Solo se guardan los datos que
                  necesitas para contactarlo y emitir su comprobante.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <caption className="sr-only">
                  Clientes con mensualidad, sus datos de contacto y su estado.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Cliente</th>
                    <th scope="col">Documento</th>
                    <th scope="col">Contacto</th>
                    <th scope="col" className="numeric">
                      Mensualidades
                    </th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="actions">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id} data-inactive={customer.status === 'inactive'}>
                      <th scope="row">{customer.fullName}</th>
                      <td className="tabular">{customer.documentNumber ?? '—'}</td>
                      <td>
                        {customer.phone ?? '—'}
                        {customer.email === null ? null : (
                          <>
                            <br />
                            <small>{customer.email}</small>
                          </>
                        )}
                      </td>
                      <td className="numeric tabular">
                        {customer.activeSubscriptions} vigentes de {customer.subscriptionCount}
                      </td>
                      <td>
                        <Badge variant={customer.status === 'active' ? 'default' : 'outline'}>
                          {CUSTOMER_STATUS_LABELS[customer.status]}
                        </Badge>
                      </td>
                      <td className="actions">
                        <div className="row-actions">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openDialog(customer)}
                          >
                            <Pencil data-icon="inline-start" />
                            Editar
                          </Button>
                          {customer.subscriptionCount === 0 ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                clearFeedback()
                                setRemoving(customer)
                              }}
                            >
                              <Trash2 data-icon="inline-start" />
                              Eliminar
                            </Button>
                          ) : null}
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

      <CustomerDialog
        open={dialogOpen}
        customer={editing}
        error={error}
        onOpenChange={setDialogOpen}
        onSubmit={(draft) =>
          editing ? updateCustomer({ ...draft, id: editing.id }) : createCustomer(draft)
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
              Solo se eliminan clientes sin mensualidades registradas. Esta acción no se puede
              deshacer.
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
              Eliminar cliente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
