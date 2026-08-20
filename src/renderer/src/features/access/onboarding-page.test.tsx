import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OnboardingPage } from './onboarding-page'

describe('onboarding', () => {
  it('solicita los datos del parqueadero y presenta el PIN como opcional', () => {
    render(<OnboardingPage />)

    expect(screen.getByRole('heading', { name: 'Prepara tu parqueadero' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre del parqueadero')).toBeInTheDocument()
    expect(screen.getByLabelText('Dirección')).toBeInTheDocument()
    expect(screen.getByLabelText('Teléfono')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Proteger con un PIN' })).not.toBeChecked()
    expect(screen.queryByLabelText('PIN de 8 dígitos')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar y comenzar' })).toBeEnabled()
  })
})
