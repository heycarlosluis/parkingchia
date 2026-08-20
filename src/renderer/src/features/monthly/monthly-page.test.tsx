import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMonthlyStore } from '@/store/monthly-store'
import { MonthlyPage } from './monthly-page'

function renderPage(initialEntry = '/mensualidades'): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <MonthlyPage />
    </MemoryRouter>,
  )
}

describe('Mensualidades', () => {
  beforeEach(() => {
    useMonthlyStore.setState({
      subscriptions: [],
      customers: [],
      plans: [],
      summary: {
        activeCount: 0,
        expiringSoonCount: 0,
        expiredCount: 0,
        pendingCollectionCop: 0,
        collectedThisMonthCop: 0,
      },
      search: '',
      status: 'all',
      loading: true,
      error: null,
      message: '',
    })
  })

  it('resume la operación mensual y lista las mensualidades vigentes', async () => {
    renderPage()

    const table = await screen.findByRole('table')
    const row = within(table).getByRole('row', { name: /MEN001/ })
    expect(within(row).getByText('María Fernanda Ríos')).toBeInTheDocument()
    expect(within(row).getByText('Mensualidad automóvil')).toBeInTheDocument()
    expect(within(row).getByText('Vigente')).toBeInTheDocument()
    expect(within(row).getByText(/^\$\s150\.000$/)).toBeInTheDocument()
    expect(within(row).getByText('Sin pagar')).toBeInTheDocument()

    expect(screen.getByText('Mensualidades vigentes')).toBeInTheDocument()
    expect(screen.getByText('Saldo por cobrar')).toBeInTheDocument()
  })

  it('filtra por matrícula y explica cuando no hay coincidencias', async () => {
    renderPage()
    await screen.findByRole('table')

    await userEvent.type(screen.getByPlaceholderText('Buscar matrícula o cliente'), 'QQQ')

    expect(await screen.findByText('Ninguna mensualidad coincide')).toBeInTheDocument()
    expect(window.parkingAPI.getMonthlyOverview).toHaveBeenCalledWith({
      search: 'QQQ',
      status: 'all',
    })
  })

  it('cobra el saldo pendiente y ofrece reimprimir el comprobante', async () => {
    renderPage()
    const table = await screen.findByRole('table')

    await userEvent.click(within(table).getByRole('button', { name: /Cobrar/ }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Saldo pendiente')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText('Efectivo recibido'), '150000')
    await userEvent.click(within(dialog).getByRole('button', { name: /Cobrar \$/ }))

    expect(await screen.findByText(/Pago registrado · MEN001/)).toBeInTheDocument()
    expect(window.parkingAPI.registerSubscriptionPayment).toHaveBeenCalledWith({
      subscriptionId: 'subscription-1',
      amountCop: 150_000,
      method: 'cash',
      receivedCop: 150_000,
      reference: null,
    })
    expect(screen.getByRole('button', { name: /Reimprimir comprobante/ })).toBeInTheDocument()
  })

  it('exige un motivo antes de cancelar una mensualidad', async () => {
    renderPage()
    const table = await screen.findByRole('table')

    await userEvent.click(within(table).getByRole('button', { name: /Cancelar/ }))

    const dialog = await screen.findByRole('alertdialog')
    const confirm = within(dialog).getByRole('button', { name: 'Cancelar mensualidad' })
    expect(confirm).toBeDisabled()

    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Cambió de vehículo')
    await userEvent.click(confirm)

    await waitFor(() => {
      expect(window.parkingAPI.cancelSubscription).toHaveBeenCalledWith({
        id: 'subscription-1',
        reason: 'Cambió de vehículo',
      })
    })
  })

  it('crea una mensualidad con la vigencia calculada desde la duración', async () => {
    renderPage()
    await screen.findByRole('table')

    await userEvent.click(screen.getByRole('button', { name: /Nueva mensualidad/ }))
    const dialog = await screen.findByRole('dialog')

    await userEvent.type(within(dialog).getByLabelText('Matrícula'), 'NUE777')
    await userEvent.click(within(dialog).getByLabelText('Cliente'))
    await userEvent.click(await screen.findByRole('option', { name: /María Fernanda Ríos/ }))
    await userEvent.click(within(dialog).getByLabelText('Plan mensual'))
    await userEvent.click(await screen.findByRole('option', { name: /Mensualidad automóvil/ }))

    await userEvent.click(within(dialog).getByRole('button', { name: /Crear mensualidad/ }))

    await waitFor(() => {
      expect(window.parkingAPI.createSubscription).toHaveBeenCalled()
    })
    const draft = vi.mocked(window.parkingAPI.createSubscription).mock.calls[0]?.[0]
    expect(draft).toMatchObject({
      customerId: 'customer-1',
      plate: 'NUE777',
      ratePlanId: 'monthly-plan-car',
      amountCop: 150_000,
    })
    expect(draft!.endDate > draft!.startDate).toBe(true)
  })

  it('administra los clientes y los planes en sus propias pestañas', async () => {
    renderPage('/mensualidades?tab=clientes')

    expect(await screen.findByText('1 cliente')).toBeInTheDocument()
    expect(screen.getByText('1020304050')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Planes' }))
    expect(await screen.findByText('1 plan mensual')).toBeInTheDocument()
    expect(screen.getByText('Disponible')).toBeInTheDocument()
  })

  it('muestra el error cuando la consulta falla', async () => {
    vi.mocked(window.parkingAPI.getMonthlyOverview).mockResolvedValueOnce({
      ok: false,
      error: { code: 'OPERATION_FAILED', message: 'No fue posible consultar.' },
    })
    renderPage()
    expect(await screen.findByText('No fue posible consultar.')).toBeInTheDocument()
  })
})
