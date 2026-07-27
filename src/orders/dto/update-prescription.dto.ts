import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreatePrescriptionDto } from './create-prescription.dto';

/**
 * Pharmacist review update — sets `status` (APPROVED / REJECTED) and `notes`.
 * `reviewedById` is set by the controller from the authenticated user, not
 * from the body. The service restores stock on REJECTED (see
 * `domain-notes.md` §2).
 */
export class UpdatePrescriptionDto extends PartialType(
  OmitType(CreatePrescriptionDto, ['orderId', 'imageUrls'] as const),
) {}
