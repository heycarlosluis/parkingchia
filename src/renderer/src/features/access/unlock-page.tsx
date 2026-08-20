import { zodResolver } from '@hookform/resolvers/zod'
import { CircleParking, LoaderCircle, LockKeyhole } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { unlockPinSchema } from '@shared/ipc'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { PinInput } from '@/features/access/pin-input'
import { useAccessStore } from '@/store/access-store'

type UnlockForm = z.infer<typeof unlockPinSchema>

export function UnlockPage(): React.JSX.Element {
  const accessState = useAccessStore((store) => store.state)
  const setAccessState = useAccessStore((store) => store.setAccessState)
  const [message, setMessage] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const { control, handleSubmit, reset, setError, formState } = useForm<UnlockForm>({
    resolver: zodResolver(unlockPinSchema),
    defaultValues: { pin: '' },
  })

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  const unlock = handleSubmit(async (values) => {
    setMessage('')
    const result = await window.parkingAPI.unlockWithPin(values)
    if (!result.ok) {
      setError('root', { message: result.error.message })
      return
    }
    if (result.data.success) {
      setAccessState(result.data.state)
      return
    }
    setMessage(result.data.message)
    setCooldown(result.data.retryAfterSeconds ?? 0)
    reset({ pin: '' })
  })

  return (
    <main className="access-screen unlock-screen">
      <Card className="unlock-card">
        <CardHeader className="unlock-header">
          <span className="unlock-mark" aria-hidden="true">
            <CircleParking />
          </span>
          <p className="onboarding-eyebrow">Acceso local</p>
          <CardTitle>{accessState?.profile?.name ?? 'Parking Chía'}</CardTitle>
          <p>Ingresa el PIN para abrir la operación del parqueadero.</p>
        </CardHeader>
        <form onSubmit={(event) => void unlock(event)} noValidate>
          <CardContent>
            {formState.errors.root ? (
              <Alert variant="destructive">
                <AlertTitle>No fue posible validar el PIN</AlertTitle>
                <AlertDescription>{formState.errors.root.message}</AlertDescription>
              </Alert>
            ) : null}
            <Controller
              name="pin"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={Boolean(fieldState.error)}>
                  <FieldLabel htmlFor="unlock-pin">PIN de 8 dígitos</FieldLabel>
                  <PinInput
                    id="unlock-pin"
                    value={field.value}
                    onChange={field.onChange}
                    describedBy={fieldState.error ? 'unlock-pin-error' : 'unlock-pin-hint'}
                    invalid={Boolean(fieldState.error)}
                    disabled={formState.isSubmitting || cooldown > 0}
                    autoFocus
                  />
                  {fieldState.error ? (
                    <FieldError id="unlock-pin-error" errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription id="unlock-pin-hint">
                      El PIN se valida únicamente en este equipo.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />
            <div className="stable-status" role="status" aria-live="polite">
              {cooldown > 0 ? `Podrás intentarlo nuevamente en ${cooldown} segundos.` : message}
            </div>
          </CardContent>
          <CardFooter className="unlock-footer">
            <p>
              <LockKeyhole aria-hidden="true" /> Sin recuperación remota
            </p>
            <Button type="submit" size="lg" disabled={formState.isSubmitting || cooldown > 0}>
              {formState.isSubmitting ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" />
              ) : null}
              {formState.isSubmitting ? 'Verificando…' : 'Abrir Parking Chía'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  )
}
