import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const timestamps = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  ...timestamps,
})

export const vehicles = sqliteTable(
  'vehicles',
  {
    id: text('id').primaryKey(),
    plate: text('plate').notNull(),
    vehicleType: text('vehicle_type', {
      enum: ['car', 'motorcycle', 'bicycle', 'other'],
    }).notNull(),
    description: text('description'),
    status: text('status', { enum: ['active', 'inactive'] })
      .notNull()
      .default('active'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('vehicles_plate_unique').on(table.plate),
    index('vehicles_plate_idx').on(table.plate),
    check('vehicles_plate_normalized', sql`${table.plate} = upper(${table.plate})`),
    check('vehicles_plate_length', sql`length(${table.plate}) between 3 and 8`),
    check(
      'vehicles_type_valid',
      sql`${table.vehicleType} in ('car', 'motorcycle', 'bicycle', 'other')`,
    ),
    check('vehicles_status_valid', sql`${table.status} in ('active', 'inactive')`),
  ],
)

export const ratePlans = sqliteTable(
  'rate_plans',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    vehicleType: text('vehicle_type', {
      enum: ['car', 'motorcycle', 'bicycle', 'other'],
    }).notNull(),
    billingUnit: text('billing_unit', { enum: ['hour', 'day', 'month'] }).notNull(),
    amountCop: integer('amount_cop').notNull(),
    graceMinutes: integer('grace_minutes').notNull().default(0),
    status: text('status', { enum: ['active', 'inactive'] })
      .notNull()
      .default('active'),
    ...timestamps,
  },
  (table) => [
    check('rate_plans_amount_nonnegative', sql`${table.amountCop} >= 0`),
    check('rate_plans_grace_nonnegative', sql`${table.graceMinutes} >= 0`),
    check(
      'rate_plans_vehicle_type_valid',
      sql`${table.vehicleType} in ('car', 'motorcycle', 'bicycle', 'other')`,
    ),
    check('rate_plans_unit_valid', sql`${table.billingUnit} in ('hour', 'day', 'month')`),
    check('rate_plans_status_valid', sql`${table.status} in ('active', 'inactive')`),
  ],
)

export const monthlyCustomers = sqliteTable(
  'monthly_customers',
  {
    id: text('id').primaryKey(),
    fullName: text('full_name').notNull(),
    documentNumber: text('document_number'),
    phone: text('phone'),
    email: text('email'),
    status: text('status', { enum: ['active', 'inactive'] })
      .notNull()
      .default('active'),
    ...timestamps,
  },
  (table) => [
    index('monthly_customers_document_idx').on(table.documentNumber),
    check('monthly_customers_status_valid', sql`${table.status} in ('active', 'inactive')`),
  ],
)

export const monthlySubscriptions = sqliteTable(
  'monthly_subscriptions',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => monthlyCustomers.id, { onDelete: 'restrict' }),
    vehicleId: text('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'restrict' }),
    ratePlanId: text('rate_plan_id')
      .notNull()
      .references(() => ratePlans.id, { onDelete: 'restrict' }),
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at').notNull(),
    amountCop: integer('amount_cop').notNull(),
    status: text('status', { enum: ['pending', 'active', 'expired', 'cancelled'] }).notNull(),
    ...timestamps,
  },
  (table) => [
    index('monthly_subscriptions_customer_idx').on(table.customerId),
    check('monthly_subscriptions_amount_nonnegative', sql`${table.amountCop} >= 0`),
    check('monthly_subscriptions_dates_valid', sql`${table.endsAt} > ${table.startsAt}`),
    check(
      'monthly_subscriptions_status_valid',
      sql`${table.status} in ('pending', 'active', 'expired', 'cancelled')`,
    ),
  ],
)

export const parkingSessions = sqliteTable(
  'parking_sessions',
  {
    id: text('id').primaryKey(),
    vehicleId: text('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'restrict' }),
    ratePlanId: text('rate_plan_id').references(() => ratePlans.id, { onDelete: 'restrict' }),
    enteredAt: text('entered_at').notNull(),
    exitedAt: text('exited_at'),
    status: text('status', { enum: ['active', 'closed', 'cancelled'] })
      .notNull()
      .default('active'),
    calculatedAmountCop: integer('calculated_amount_cop'),
    notes: text('notes'),
    ...timestamps,
  },
  (table) => [
    index('parking_sessions_active_idx').on(table.status, table.enteredAt),
    index('parking_sessions_vehicle_idx').on(table.vehicleId),
    uniqueIndex('parking_sessions_one_active_vehicle')
      .on(table.vehicleId)
      .where(sql`${table.status} = 'active'`),
    check(
      'parking_sessions_amount_nonnegative',
      sql`${table.calculatedAmountCop} is null or ${table.calculatedAmountCop} >= 0`,
    ),
    check(
      'parking_sessions_status_valid',
      sql`${table.status} in ('active', 'closed', 'cancelled')`,
    ),
  ],
)

export const cashRegisterSessions = sqliteTable(
  'cash_register_sessions',
  {
    id: text('id').primaryKey(),
    openedAt: text('opened_at').notNull(),
    closedAt: text('closed_at'),
    openingAmountCop: integer('opening_amount_cop').notNull(),
    closingAmountCop: integer('closing_amount_cop'),
    expectedAmountCop: integer('expected_amount_cop'),
    status: text('status', { enum: ['open', 'closed'] })
      .notNull()
      .default('open'),
    notes: text('notes'),
    ...timestamps,
  },
  (table) => [
    index('cash_register_sessions_status_idx').on(table.status),
    uniqueIndex('cash_register_only_one_open')
      .on(table.status)
      .where(sql`${table.status} = 'open'`),
    check('cash_register_opening_nonnegative', sql`${table.openingAmountCop} >= 0`),
    check('cash_register_status_valid', sql`${table.status} in ('open', 'closed')`),
  ],
)

export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey(),
    parkingSessionId: text('parking_session_id').references(() => parkingSessions.id, {
      onDelete: 'restrict',
    }),
    subscriptionId: text('subscription_id').references(() => monthlySubscriptions.id, {
      onDelete: 'restrict',
    }),
    cashRegisterSessionId: text('cash_register_session_id').references(
      () => cashRegisterSessions.id,
      { onDelete: 'restrict' },
    ),
    amountCop: integer('amount_cop').notNull(),
    method: text('method', { enum: ['cash', 'card', 'transfer', 'other'] }).notNull(),
    status: text('status', { enum: ['completed', 'voided', 'refunded'] }).notNull(),
    paidAt: text('paid_at').notNull(),
    reference: text('reference'),
    ...timestamps,
  },
  (table) => [
    index('payments_paid_at_idx').on(table.paidAt),
    check('payments_amount_positive', sql`${table.amountCop} > 0`),
    check(
      'payments_subject_present',
      sql`${table.parkingSessionId} is not null or ${table.subscriptionId} is not null`,
    ),
    check('payments_method_valid', sql`${table.method} in ('cash', 'card', 'transfer', 'other')`),
    check('payments_status_valid', sql`${table.status} in ('completed', 'voided', 'refunded')`),
  ],
)

export const receipts = sqliteTable(
  'receipts',
  {
    id: text('id').primaryKey(),
    receiptNumber: integer('receipt_number').notNull(),
    paymentId: text('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),
    issuedAt: text('issued_at').notNull(),
    printedAt: text('printed_at'),
    status: text('status', { enum: ['issued', 'voided'] })
      .notNull()
      .default('issued'),
    snapshotJson: text('snapshot_json').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('receipts_number_unique').on(table.receiptNumber),
    uniqueIndex('receipts_payment_unique').on(table.paymentId),
    check('receipts_number_positive', sql`${table.receiptNumber} > 0`),
    check('receipts_status_valid', sql`${table.status} in ('issued', 'voided')`),
  ],
)

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    actor: text('actor').notNull().default('local-operator'),
    detailsJson: text('details_json'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('audit_logs_entity_idx').on(table.entityType, table.entityId),
    index('audit_logs_created_at_idx').on(table.createdAt),
  ],
)
