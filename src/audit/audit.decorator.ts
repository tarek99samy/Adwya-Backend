import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditMetadata {
  /** Entity family, e.g. "Refund", "PharmacyBranch", "BranchInventory". */
  entityType: string;
  /** "CREATE" | "UPDATE" | "DELETE" | "STATUS_CHANGE" | anything meaningful. */
  action: string;
  /** Path parameter naming the entity when the handler returns no id. Default "id". */
  idParam?: string;
}

/**
 * Marks a handler for audit logging.
 *
 *   @Audit({ entityType: 'Refund', action: 'STATUS_CHANGE' })
 *   @Patch(':id')
 *   decide(...) { ... }
 *
 * Opt-in on purpose — auditing every mutation would bury the entries that
 * matter under routine cart traffic.
 */
export const Audit = (meta: AuditMetadata) => SetMetadata(AUDIT_KEY, meta);
