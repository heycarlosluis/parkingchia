-- Hasta 0.1.0-alpha.10, anular en Caja el cobro de un pago pendiente devolvía
-- la deuda al listado. Desde D-048 esa anulación es definitiva: las deudas que
-- ya habían vuelto por una anulación se enlazan otra vez a su cobro anulado.
-- No se borra ninguna fila; cada corrección queda en la auditoría.
INSERT INTO `audit_logs` (`id`, `action`, `entity_type`, `entity_id`, `actor`, `details_json`, `created_at`)
SELECT lower(hex(randomblob(16))),
       'parking.pending_payment_voided_by_migration',
       'parking_session',
       pp.`parking_session_id`,
       'system-migration',
       json_object('pendingPaymentId', pp.`id`, 'amountCop', pp.`amount_cop`),
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `pending_payments` pp
WHERE pp.`status` = 'pending'
  AND EXISTS (
    SELECT 1 FROM `payments` p
    WHERE p.`parking_session_id` = pp.`parking_session_id` AND p.`status` = 'voided'
  );--> statement-breakpoint
UPDATE `pending_payments`
SET `status` = 'paid',
    `payment_id` = (
      SELECT p.`id` FROM `payments` p
      WHERE p.`parking_session_id` = `pending_payments`.`parking_session_id`
        AND p.`status` = 'voided'
      ORDER BY p.`paid_at` DESC, p.`rowid` DESC LIMIT 1
    ),
    `settled_at` = (
      SELECT p.`paid_at` FROM `payments` p
      WHERE p.`parking_session_id` = `pending_payments`.`parking_session_id`
        AND p.`status` = 'voided'
      ORDER BY p.`paid_at` DESC, p.`rowid` DESC LIMIT 1
    ),
    `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `status` = 'pending'
  AND EXISTS (
    SELECT 1 FROM `payments` p
    WHERE p.`parking_session_id` = `pending_payments`.`parking_session_id`
      AND p.`status` = 'voided'
  );
