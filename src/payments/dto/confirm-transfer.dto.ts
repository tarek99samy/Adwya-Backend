import { IsBoolean } from 'class-validator';

/**
 * Body for POST /payments/transactions/:id/confirm — branch staff accepting or
 * rejecting a customer-reported InstaPay transfer after checking the bank
 * statement.
 */
export class ConfirmTransferDto {
  @IsBoolean()
  accept!: boolean;
}
