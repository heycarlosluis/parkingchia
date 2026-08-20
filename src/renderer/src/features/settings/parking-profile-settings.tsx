import { zodResolver } from '@hookform/resolvers/zod'
import { Building2, LoaderCircle } from 'lucide-react'
import { useEffect } from 'react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { ParkingProfile } from '@shared/contracts'
import { parkingProfileSchema } from '@shared/ipc'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useAccessStore } from '@/store/access-store'

const EMPTY_PROFILE: ParkingProfile = { name: '', address: '', phone: '' }

export function ParkingProfileSettings(): React.JSX.Element {
  const accessState = useAccessStore((store) => store.state)
  const setAccessState = useAccessStore((store) => store.setAccessState)
  const [message, setMessage] = useState('')
  const { register, handleSubmit, reset, setError, formState } = useForm<ParkingProfile>({
    resolver: zodResolver(parkingProfileSchema),
    defaultValues: accessState?.profile ?? EMPTY_PROFILE,
  })

  useEffect(() => {
    reset(accessState?.profile ?? EMPTY_PROFILE)
  }, [accessState?.profile, reset])

  const saveProfile = handleSubmit(async (values) => {
    setMessage('')
    const result = await window.parkingAPI.updateParkingProfile(values)
    if (result.ok) {
      setAccessState(result.data)
      reset(result.data.profile ?? EMPTY_PROFILE)
      setMessage('Datos del parqueadero guardados.')
    } else setError('root', { message: result.error.message })
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="title-with-icon">
          <Building2 aria-hidden="true" /> Datos del parqueadero
        </CardTitle>
        <CardDescription>
          Esta información identifica la operación y aparece en los tickets de prueba.
        </CardDescription>
      </CardHeader>
      <form onSubmit={(event) => void saveProfile(event)} noValidate>
        <CardContent>
          {formState.errors.root ? (
            <Alert variant="destructive">
              <AlertTitle>No fue posible guardar los datos</AlertTitle>
              <AlertDescription>{formState.errors.root.message}</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup>
            <Field data-invalid={Boolean(formState.errors.name)}>
              <FieldLabel htmlFor="settings-parking-name">Nombre del parqueadero</FieldLabel>
              <Input
                id="settings-parking-name"
                className="min-h-11"
                autoComplete="organization"
                aria-invalid={Boolean(formState.errors.name)}
                aria-describedby={formState.errors.name ? 'settings-parking-name-error' : undefined}
                {...register('name')}
              />
              <FieldError id="settings-parking-name-error" errors={[formState.errors.name]} />
            </Field>
            <Field data-invalid={Boolean(formState.errors.address)}>
              <FieldLabel htmlFor="settings-parking-address">Dirección</FieldLabel>
              <Input
                id="settings-parking-address"
                className="min-h-11"
                autoComplete="street-address"
                aria-invalid={Boolean(formState.errors.address)}
                aria-describedby={
                  formState.errors.address ? 'settings-parking-address-error' : undefined
                }
                {...register('address')}
              />
              <FieldError id="settings-parking-address-error" errors={[formState.errors.address]} />
            </Field>
            <Field data-invalid={Boolean(formState.errors.phone)}>
              <FieldLabel htmlFor="settings-parking-phone">Teléfono</FieldLabel>
              <Input
                id="settings-parking-phone"
                className="min-h-11"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                aria-invalid={Boolean(formState.errors.phone)}
                aria-describedby={
                  formState.errors.phone ? 'settings-parking-phone-error' : undefined
                }
                {...register('phone')}
              />
              <FieldError id="settings-parking-phone-error" errors={[formState.errors.phone]} />
            </Field>
          </FieldGroup>
          <div className="stable-status" role="status" aria-live="polite">
            {message}
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={formState.isSubmitting || !formState.isDirty}>
            {formState.isSubmitting ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : null}
            {formState.isSubmitting ? 'Guardando…' : 'Guardar datos'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
