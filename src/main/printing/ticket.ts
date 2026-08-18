import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { PaperWidth } from '@shared/contracts'
import { formatCurrency } from '@shared/format'

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }
    return entities[character] ?? character
  })
}

export function createTestTicketHtml(paperWidth: PaperWidth): string {
  const ticketNumber = `PR-${Date.now().toString().slice(-8)}`
  const localDate = format(new Date(), "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es })
  const width = paperWidth === '58mm' ? 58 : 80

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>Ticket de prueba</title>
    <style>
      @page { size: ${width}mm auto; margin: 3mm; }
      * { box-sizing: border-box; }
      body { width: ${width - 6}mm; margin: 0; color: #000; background: #fff; font: 11px/1.35 ui-monospace, monospace; }
      h1 { margin: 0 0 2mm; text-align: center; font-size: 17px; }
      .subtitle { margin: 0 0 3mm; text-align: center; font-weight: 700; }
      .rule { border-top: 1px dashed #000; margin: 2mm 0; }
      dl { margin: 0; }
      .row { display: flex; justify-content: space-between; gap: 3mm; margin: 1mm 0; }
      dt { font-weight: 400; }
      dd { margin: 0; text-align: right; font-weight: 700; }
      .total { font-size: 14px; }
      .footer { margin-top: 3mm; text-align: center; font-size: 9px; }
    </style>
  </head>
  <body>
    <h1>Parking Chía</h1>
    <p class="subtitle">Ticket de prueba</p>
    <div class="rule"></div>
    <dl>
      <div class="row"><dt>Número</dt><dd>${escapeHtml(ticketNumber)}</dd></div>
      <div class="row"><dt>Fecha</dt><dd>${escapeHtml(localDate)}</dd></div>
      <div class="row"><dt>Matrícula</dt><dd>ABC123</dd></div>
      <div class="row"><dt>Tarifa</dt><dd>Automóvil / hora</dd></div>
    </dl>
    <div class="rule"></div>
    <div class="row total"><strong>Total</strong><strong>${escapeHtml(formatCurrency(5000))}</strong></div>
    <p class="footer">Impresión de diagnóstico · Papel ${paperWidth}</p>
  </body>
</html>`
}
