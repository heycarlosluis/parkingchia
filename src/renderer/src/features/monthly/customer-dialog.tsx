import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import type { MonthlyCustomer, MonthlyCustomerDraft } from '@shared/contracts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const customerFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, 'El nombre del cliente es obligatorio')
    .max(80, 'El nombre del cliente es demasiado largo'),
  documentNumber: z.string().trim().max(20, 'El documento es demasiado largo'),
  phone: z
    .string()
    .trim()
    .max(25, 'El teléfono es demasiado largo')
    .refine(
      (value) => value === '' || /^[+\d()\-\s]{7,25}$/.test(value),
      'Usa un número de teléfono válido',
    ),
  email: z
    .string()
    .trim()
    .max(120, 'El correo es demasiado largo')
    .refine(
      (value) => value === '' || z.email().safeParse(value).success,
      'Usa un correo electrónico válido',
    ),
  notes: z.string().trim().max(200, 'La nota es demasiado larga'),
  active: z.boolean(),
})

type CustomerForm = z.infer<typeof customerFormSchema>

const EMPTY_FORM: CustomerForm = {
  fullName: '',
  documentNumber: '',
  phone: '',
  email: '',
  notes: '',
  active: true,
}

function toForm(customer: MonthlyCustomer | null): CustomerForm {
  if (!customer) return EMPTY_FORM
  return {
    fullName: customer.fullName,
    documentNumber: customer.documentNumber ?? '',
    phone: customer.phone ?? '',
    email: customer.email ?? '',
    notes: customer.notes ?? '',
    active: customer.status === 'active',
  }
}

const optional = (value: string): string | null => (value === '' ? null : value)

type CustomerDialogProps = {
  open: boolean
  customer: MonthlyCustomer | null
  error: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: MonthlyCustomerDraft) => Promise<boolean>
}

export function CustomerDialog({
  open,
  customer,
  error,
  onOpenChange,
  onSubmit,
}: CustomerDialogProps): React.JSX.Element {
  const { control, handleSubmit, register, reset, formState } = useForm<CustomerForm>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: toForm(customer),
  })

  useEffect(() => {
    if (open) reset(toForm(customer))
  }, [open, customer, reset])

  const submit = handleSubmit(async (values) => {
    const saved = await onSubmit({
      fullName: values.fullName,
      documentNumber: optional(values.documentNumber),
      phone: optional(values.phone),
      email: optional(values.email),
      notes: optional(values.notes),
      status: values.active ? 'active' : 'inactive',
    })
    if (saved) onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rate-plan-dialog">
        <DialogHeader>
          <DialogTitle>{customer ? 'Editar cliente' : 'Nuevo cliente mensual'}</DialogTitle>
          <DialogDescription>
            Los datos de contacto quedan guardados en este equipo y se usan en el comprobante de
            pago.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} noValidate>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>No fue posible guardar el cliente</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup>
            <Field data-invalid={Boolean(formState.errors.fullName)}>
              <FieldLabel htmlFor="customer-name">Nombre completo</FieldLabel>
              <Input
                id="customer-name"
                className="min-h-11"
                autoComplete="off"
                placeholder="María Fernanda Ríos"
                aria-invalid={Boolean(formState.errors.fullName)}
                {...register('fullName')}
              />
              <FieldError errors={[formState.errors.fullName]} />
            </Field>

            <Field data-invalid={Boolean(formState.errors.documentNumber)}>
              <FieldLabel htmlFor="customer-document">Documento (opcional)</FieldLabel>
              <Input
                id="customer-document"
                className="min-h-11"
                autoComplete="off"
                placeholder="1020304050"
                aria-invalid={Boolean(formState.errors.documentNumber)}
                {...register('documentNumber')}
              />
              <FieldDescription>No puede repetirse entre clientes.</FieldDescription>
              <FieldError errors={[formState.errors.documentNumber]} />
            </Field>

            <Field data-invalid={Boolean(formState.errors.phone)}>
              <FieldLabel htmlFor="customer-phone">Teléfono (opcional)</FieldLabel>
              <Input
                id="customer-phone"
                className="min-h-11"
                autoComplete="off"
                placeholder="300 123 4567"
                aria-invalid={Boolean(formState.errors.phone)}
                {...register('phone')}
              />
              <FieldError errors={[formState.errors.phone]} />
            </Field>

            <Field data-invalid={Boolean(formState.errors.email)}>
              <FieldLabel htmlFor="customer-email">Correo (opcional)</FieldLabel>
              <Input
                id="customer-email"
                className="min-h-11"
                autoComplete="off"
                placeholder="cliente@correo.com"
                aria-invalid={Boolean(formState.errors.email)}
                {...register('email')}
              />
              <FieldError errors={[formState.errors.email]} />
            </Field>

            <Field data-invalid={Boolean(formState.errors.notes)}>
              <FieldLabel htmlFor="customer-notes">Nota (opcional)</FieldLabel>
              <Input
                id="customer-notes"
                className="min-h-11"
                autoComplete="off"
                placeholder="Oficina 302, paga los primeros cinco días"
                {...register('notes')}
              />
              <FieldError errors={[formState.errors.notes]} />
            </Field>

            <Field orientation="horizontal">
              <Controller
                control={control}
                name="active"
                render={({ field }) => (
                  <Checkbox
                    id="customer-active"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                )}
              />
              <FieldLabel htmlFor="customer-active">
                Cliente activo, puede contratar mensualidades
              </FieldLabel>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" />
              ) : null}
              {customer ? 'Guardar cambios' : 'Crear cliente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
