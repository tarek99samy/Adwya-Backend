/**
 * Job contracts shared by the producer (API) and the consumer (worker).
 *
 * These cross a process boundary as JSON, so keep them flat and serialisable —
 * no Dates, no Prisma Decimals, no class instances.
 */

export const NOTIFY_JOB = 'notify';

/**
 * `templateCode` matches a seeded `NotificationTemplate.code`. The worker fills
 * `{{placeholder}}` slots in that template from `variables`.
 */
export interface NotifyJobData {
  userId: string;
  templateCode: string;
  /** Grouping tag stored on the Notification row, e.g. "ORDER_UPDATE". */
  type: string;
  variables: Record<string, string | number>;
}

/** Template codes seeded by `prisma/seed.ts`. */
export const NotificationTemplates = {
  ORDER_PLACED: 'ORDER_PLACED',
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
  ORDER_OUT_FOR_DELIVERY: 'ORDER_OUT_FOR_DELIVERY',
  ORDER_DELIVERED: 'ORDER_DELIVERED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  PRESCRIPTION_APPROVED: 'PRESCRIPTION_APPROVED',
  PRESCRIPTION_REJECTED: 'PRESCRIPTION_REJECTED',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
} as const;

/** Replaces `{{key}}` with the matching variable; unknown slots are left blank. */
export function renderTemplate(
  template: string,
  variables: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
    key in variables ? String(variables[key]) : '',
  );
}
