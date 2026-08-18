import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSystemStore } from '@/store/system-store'
import { ActiveSessionsPage } from './active-sessions-page'

describe('estado vacío de parqueo activo', () => {
  beforeEach(() => {
    useSystemStore.setState({ status: null, loading: false, error: null })
  })

  it('orienta al operador cuando no existen sesiones', () => {
    render(<ActiveSessionsPage />)
    expect(screen.getByText('No hay vehículos activos')).toBeInTheDocument()
    expect(screen.getByText(/después de registrar su ingreso/)).toBeInTheDocument()
  })
})
