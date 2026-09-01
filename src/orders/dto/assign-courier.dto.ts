import { IsUUID } from 'class-validator';

/**
 * Body for POST /orders/:id/delivery. The order comes from the path; the
 * service checks that the courier is COURIER-role staff at that same branch.
 */
export class AssignCourierDto {
  @IsUUID()
  courierStaffId!: string;
}
