import { zodResolver } from '@hookform/resolvers/zod'
import { Building2, ImageUp, LoaderCircle, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import type { z } from 'zod'
import type { ParkingProfile } from '@shared/contracts'
import { MAX_LOGO_BYTES, parkingProfileSchema } from '@shared/ipc'
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

const EMPTY_PROFILE: ParkingProfile = { name: '', address: '', phone: '', logoDataUrl: null }
type ProfileFormInput = z.input<typeof parkingProfileSchema>
type ProfileForm = z.output<typeof parkingProfileSchema>

export function ParkingProfileSettings(): React.JSX.Element {
  const accessState = useAccessStore((store) => store.state)
  const setAccessState = useAccessStore((store) => store.setAccessState)
  const [message, setMessage] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)
  const { register, handleSubmit, reset, setError, clearErrors, setValue, control, formState } =
    useForm<ProfileFormInput, unknown, ProfileForm>({
      resolver: zodResolver(parkingProfileSchema),
      defaultValues: accessState?.profile ?? EMPTY_PROFILE,
    })
  const logoDataUrl = useWatch({ control, name: 'logoDataUrl' })

  useEffect(() => {
    reset(accessState?.profile ?? EMPTY_PROFILE)
  }, [accessState?.profile, reset])

  const saveProfile = handleSubmit(async (values) => {
    setMessage('')
    const profile: ParkingProfile = {
      name: values.name,
      address: values.address,
      phone: values.phone,
      ...(values.logoDataUrl === undefined ? {} : { logoDataUrl: values.logoDataUrl }),
    }
    const result = await window.parkingAPI.updateParkingProfile(profile)
    if (result.ok) {
      setAccessState(result.data)
      reset(result.data.profile ?? EMPTY_PROFILE)
      setMessage('Datos del parqueadero guardados.')
    } else setError('root', { message: result.error.message })
  })

  const selectLogo = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    if (!file) return
    setMessage('')
    clearErrors('logoDataUrl')
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('logoDataUrl', { message: 'Usa un logo PNG, JPEG o WebP.' })
      event.target.value = ''
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError('logoDataUrl', { message: 'El logo debe pesar máximo 1 MB.' })
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      setValue('logoDataUrl', reader.result, { shouldDirty: true, shouldValidate: true })
    }
    reader.onerror = () => setError('logoDataUrl', { message: 'No fue posible leer esa imagen.' })
    reader.readAsDataURL(file)
  }

  const removeLogo = (): void => {
    setValue('logoDataUrl', null, { shouldDirty: true, shouldValidate: true })
    clearErrors('logoDataUrl')
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="title-with-icon">
          <Building2 aria-hidden="true" /> Datos del parqueadero
        </CardTitle>
        <CardDescription>
          Esta información identifica la operación y aparece en los tiquetes y recibos impresos.
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
            <Field data-invalid={Boolean(formState.errors.logoDataUrl)}>
              <FieldLabel htmlFor="settings-parking-logo">Logo del parqueadero</FieldLabel>
              <div className="profile-logo-control">
                <div className="profile-logo-preview">
                  {logoDataUrl ? (
                    <img src={logoDataUrl} alt="Vista previa del logo del parqueadero" />
                  ) : (
                    <span>Sin logo</span>
                  )}
                </div>
                <div className="profile-logo-actions">
                  <Input
                    ref={logoInputRef}
                    id="settings-parking-logo"
                    className="sr-only"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={selectLogo}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <ImageUp data-icon="inline-start" />
                    Elegir imagen
                  </Button>
                  {logoDataUrl ? (
                    <Button type="button" variant="ghost" onClick={removeLogo}>
                      <Trash2 data-icon="inline-start" />
                      Quitar logo
                    </Button>
                  ) : null}
                  <p className="field-hint">PNG, JPEG o WebP; máximo 1 MB.</p>
                </div>
              </div>
              <FieldError
                id="settings-parking-logo-error"
                errors={[formState.errors.logoDataUrl]}
              />
            </Field>
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
