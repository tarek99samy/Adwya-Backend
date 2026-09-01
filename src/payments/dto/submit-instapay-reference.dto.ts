import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Body for POST /payments/orders/:orderId/instapay.
 *
 * InstaPay is a bank rail, not a gateway: the customer transfers manually and
 * reports the reference here. Branch staff confirms it against the bank
 * statement before the payment settles.
 */
export class SubmitInstapayReferenceDto {
  @IsString()
  @MaxLength(60)
  // Alphanumeric with dashes — deliberately permissive, banks differ.
  @Matches(/^[A-Za-z0-9-]{6,60}$/, {
    message: 'reference must be 6-60 alphanumeric characters',
  })
  reference!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
