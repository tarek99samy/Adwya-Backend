import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateDeliveryRunDto } from './create-delivery-run.dto';

/**
 * Updates the courier-app "events" — pickup, delivery, GPS tick. `orderId`
 * and `courierStaffId` are immutable: changing courier is a new run.
 */
export class UpdateDeliveryRunDto extends PartialType(
  OmitType(CreateDeliveryRunDto, ['orderId', 'courierStaffId'] as const),
) {}
