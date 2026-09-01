import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrescriptionStatus } from '../../common/enums';

/** The only two outcomes a pharmacist review can produce. */
export const REVIEW_OUTCOMES = [
  PrescriptionStatus.APPROVED,
  PrescriptionStatus.REJECTED,
] as const;

export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

/**
 * Body for PATCH /prescriptions/:id — a pharmacist approving or rejecting an
 * uploaded prescription. `reviewedById` is taken from the token, never the body.
 *
 * `@IsIn` rather than `@IsEnum`: the enum also carries NOT_REQUIRED and
 * PENDING_REVIEW, and the service treats anything that is not APPROVED as a
 * rejection — so accepting the full enum would let `status: PENDING_REVIEW`
 * silently kill an order and reverse its stock.
 */
export class ReviewPrescriptionDto {
  @IsIn(REVIEW_OUTCOMES as readonly string[])
  status!: ReviewOutcome;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
