import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, LockKeyhole, ShieldCheck, ShieldOff } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { useState } from 'react'
import { z } from 'zod'
import { pinSchema } from '@shared/ipc'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { PinInput } from '@/features/access/pin-input'
import { useAccessStore } from '@/store/access-store'

const securityFormSchema = z
  .object({
    currentPin: z.union([z.literal(''), pinSchema]),
    newPin: pinSchema,
    confirmPin: z.string(),
  })
  .superRefine((value, context) => {
    if (value.confirmPin !== value.newPin) {
      context.addIssue({ code: 'custom', path: ['confirmPin'], message: 'Los PIN no coinciden' })
    }
  })

type SecurityForm = z.infer<typeof securityFormSchema>

export function SecuritySettings(): React.JSX.Element {
  const accessState = useAccessStore((store) => store.state)
  const setAccessState = useAccessStore((store) => store.setAccessState)
  const pinConfigured = accessState?.pinConfigured ?? false
  const [message, setMessage] = useState('')
  const { control, handleSubmit, getValues, reset, setError, setFocus, formState } =
    useForm<SecurityForm>({
      resolver: zodResolver(securityFormSchema),
      defaultValues: { currentPin: '', newPin: '', confirmPin: '' },
    })

  const savePin = handleSubmit(async (values) => {
    setMessage('')
    if (pinConfigured && !pinSchema.safeParse(values.currentPin).success) {
      setError(
        'currentPin',
        { message: 'Ingresa el PIN actual de 8 dígitos' },
        { shouldFocus: true },
      )
      return
    }
    const input = pinConfigured
      ? { currentPin: values.currentPin, newPin: values.newPin }
      : { newPin: values.newPin }
    const result = await window.parkingAPI.setPin(input)
    if (!result.ok) {
      setError('root', { message: result.error.message })
      return
    }
    if (!result.data.success) {
      setError('currentPin', { message: result.data.message }, { shouldFocus: true })
      return
    }
    setAccessState(result.data.state)
    reset()
    setMessage(result.data.message)
  })

  const removePin = async (): Promise<void> => {
    setMessage('')
    const currentPin = getValues('currentPin')
    if (!pinSchema.safeParse(currentPin).success) {
      setError('currentPin', { message: 'Ingresa el PIN actual de 8 dígitos' })
      setFocus('currentPin')
      return
    }
    const result = await window.parkingAPI.removePin({ currentPin })
    if (!result.ok) {
      setError('root', { message: result.error.message })
      return
    }
    if (!result.data.success) {
      setError('currentPin', { message: result.data.message })
      setFocus('currentPin')
      return
    }
    setAccessState(result.data.state)
    reset()
    setMessage(result.data.message)
  }

  const lockApplication = async (): Promise<void> => {
    const result = await window.parkingAPI.lockApplication()
    if (result.ok) setAccessState(result.data)
    else setError('root', { message: result.error.message })
  }

  return (
    <Card>
      <CardHeader>
        <div className="security-heading">
          <CardTitle className="title-with-icon">
            <ShieldCheck aria-hidden="true" /> Acceso local
          </CardTitle>
          <Badge variant={pinConfigured ? 'secondary' : 'outline'}>
            {pinConfigured ? 'PIN activo' : 'Sin PIN'}
          </Badge>
        </div>
        <CardDescription>
          {pinConfigured
            ? 'La aplicación solicitará el PIN de 8 dígitos al abrirse.'
            : 'Puedes usar la aplicación sin PIN o activar uno cuando lo necesites.'}
        </CardDescription>
      </CardHeader>
      <form onSubmit={(event) => void savePin(event)} noValidate>
        <CardContent>
          {formState.errors.root ? (
            <Alert variant="destructive">
              <AlertTitle>No fue posible actualizar el PIN</AlertTitle>
              <AlertDescription>{formState.errors.root.message}</AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup>
            {pinConfigured ? (
              <Controller
                name="currentPin"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={Boolean(fieldState.error)}>
                    <FieldLabel htmlFor="current-pin">PIN actual</FieldLabel>
                    <PinInput
                      id="current-pin"
                      value={field.value}
                      onChange={field.onChange}
                      describedBy={fieldState.error ? 'current-pin-error' : 'current-pin-hint'}
                      invalid={Boolean(fieldState.error)}
                    />
                    {fieldState.error ? (
                      <FieldError id="current-pin-error" errors={[fieldState.error]} />
                    ) : (
                      <FieldDescription id="current-pin-hint">
                        Se requiere para cambiar o eliminar la protección.
                      </FieldDescription>
                    )}
                  </Field>
                )}
              />
            ) : null}

            <Controller
              name="newPin"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={Boolean(fieldState.error)}>
                  <FieldLabel htmlFor="new-pin">
                    {pinConfigured ? 'Nuevo PIN' : 'PIN de 8 dígitos'}
                  </FieldLabel>
                  <PinInput
                    id="new-pin"
                    value={field.value}
                    onChange={field.onChange}
                    describedBy={fieldState.error ? 'new-pin-error' : 'new-pin-hint'}
                    invalid={Boolean(fieldState.error)}
                  />
                  {fieldState.error ? (
                    <FieldError id="new-pin-error" errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription id="new-pin-hint">
                      No existe recuperación por Internet. Guarda el PIN en un lugar seguro.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />

            <Controller
              name="confirmPin"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={Boolean(fieldState.error)}>
                  <FieldLabel htmlFor="confirm-new-pin">Confirmar nuevo PIN</FieldLabel>
                  <PinInput
                    id="confirm-new-pin"
                    value={field.value}
                    onChange={field.onChange}
                    describedBy="confirm-new-pin-error"
                    invalid={Boolean(fieldState.error)}
                  />
                  <FieldError id="confirm-new-pin-error" errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>

          <div className="stable-status" role="status" aria-live="polite">
            {message}
          </div>
        </CardContent>
        <CardFooter className="security-actions">
          <Button type="submit" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : null}
            {formState.isSubmitting ? 'Guardando…' : pinConfigured ? 'Cambiar PIN' : 'Crear PIN'}
          </Button>

          {pinConfigured ? (
            <>
              <Button type="button" variant="outline" onClick={() => void lockApplication()}>
                <LockKeyhole data-icon="inline-start" />
                Bloquear ahora
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="ghost">
                    <ShieldOff data-icon="inline-start" />
                    Eliminar PIN
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar la protección con PIN?</AlertDialogTitle>
                    <AlertDialogDescription>
                      La aplicación volverá a abrirse directamente en este equipo. Para confirmar,
                      el PIN actual debe estar escrito en el formulario.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className={buttonVariants({ variant: 'destructive' })}
                      onClick={() => void removePin()}
                    >
                      Eliminar PIN
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : null}
        </CardFooter>
      </form>
    </Card>
  )
}
