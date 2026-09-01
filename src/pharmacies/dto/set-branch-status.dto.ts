import { IsIn } from 'class-validator';
import { BranchStatus } from '../../common/enums';

/** Suspend or reinstate an already-approved branch. */
export const BRANCH_LIFECYCLE_STATUSES = [
  BranchStatus.APPROVED,
  BranchStatus.SUSPENDED,
] as const;

export class SetBranchStatusDto {
  @IsIn(BRANCH_LIFECYCLE_STATUSES as readonly string[])
  status!: (typeof BRANCH_LIFECYCLE_STATUSES)[number];
}
