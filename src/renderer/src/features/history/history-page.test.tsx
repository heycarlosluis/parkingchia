import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HistoryPage } from './history-page'

describe('Historial de salidas', () => {
  it('lista las salidas con su cobro y el recibo emitido', async () => {
    render(<HistoryPage />)

    const table = await screen.findByRole('table')
    const cobrada = within(table).getByRole('row', { name: /ABC123/ })
    expect(within(cobrada).getByText('1 h 30 min')).toBeInTheDocument()
    expect(within(cobrada).getByText(/^\$\s10\.000$/)).toBeInTheDocument()
    expect(within(cobrada).getByText(/N\.º 1 · Efectivo/)).toBeInTheDocument()

    const anulada = within(table).getByRole('row', { name: /ZZZ999/ })
    expect(within(anulada).getByText('Ingreso anulado')).toBeInTheDocument()
    expect(within(anulada).queryByRole('button', { name: /Reimprimir/ })).not.toBeInTheDocument()
  })

  it('resume cuántas salidas hay y cuánto se cobró', async () => {
    render(<HistoryPage />)
    expect(await screen.findByText(/^2 salidas$/)).toBeInTheDocument()
    expect(screen.getByText(/\$\s10\.000 cobrados/)).toBeInTheDocument()
  })

  it('filtra por matrícula y explica cuando no hay coincidencias', async () => {
    render(<HistoryPage />)
    await screen.findByRole('table')

    await userEvent.type(screen.getByPlaceholderText('Buscar matrícula'), 'QQQ')

    expect(await screen.findByText('Ninguna salida coincide')).toBeInTheDocument()
    expect(screen.getByText(/^0 salidas$/)).toBeInTheDocument()
    expect(screen.getByText(/Ajusta la matrícula o el rango de fechas/)).toBeInTheDocument()
  })

  it('reimprime el recibo de una salida antigua e informa el resultado', async () => {
    render(<HistoryPage />)
    const table = await screen.findByRole('table')
    const cobrada = within(table).getByRole('row', { name: /ABC123/ })

    await userEvent.click(within(cobrada).getByRole('button', { name: /Reimprimir/ }))

    expect(await screen.findByText('No hay impresoras.')).toBeInTheDocument()
    expect(window.parkingAPI.reprintReceipt).toHaveBeenCalledWith({
      sessionId: 'session-closed',
    })
  })

  it('muestra el error cuando la consulta falla', async () => {
    vi.mocked(window.parkingAPI.listExits).mockResolvedValueOnce({
      ok: false,
      error: { code: 'OPERATION_FAILED', message: 'No fue posible consultar.' },
    })
    render(<HistoryPage />)
    expect(await screen.findByText('No fue posible consultar.')).toBeInTheDocument()
  })
})
