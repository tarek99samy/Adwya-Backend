import { IsIn } from 'class-validator';
import { BranchStatus } from '../../common/enums';

/** The two outcomes of an admin reviewing a branch application. */
export const BRANCH_REVIEW_OUTCOMES = [
  BranchStatus.APPROVED,
  BranchStatus.REJECTED,
] as const;

export type BranchReviewOutcome = (typeof BRANCH_REVIEW_OUTCOMES)[number];

/**
 * `@IsIn` rather than `@IsEnum`: BranchStatus also carries PENDING_APPROVAL and
 * SUSPENDED, neither of which is a valid review verdict. Suspension has its own
 * endpoint.
 */
export class ReviewBranchDto {
  @IsIn(BRANCH_REVIEW_OUTCOMES as readonly string[])
  status!: BranchReviewOutcome;
}
