import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { SubmitInstapayReferenceDto } from './dto/submit-instapay-reference.dto';
import { ConfirmTransferDto } from './dto/confirm-transfer.dto';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { Audit } from '../audit/audit.decorator';
import type { AuthenticatedUser } from '../rbac/decorators/current-user.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /** Starts a gateway payment. Rejected for cash / on-delivery / InstaPay. */
  @Post('intent')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createIntent(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePaymentIntentDto) {
    return this.paymentsService.createIntent(user.id, dto);
  }

  /**
   * Provider callback.
   *
   * `@Public()` because the gateway has no bearer token — authenticity comes
   * from the HMAC signature instead. The payload is logged whether or not that
   * signature checks out, and the handler always answers 200: providers retry
   * on non-2xx, and no retry fixes a malformed body.
   */
  @Post('webhooks/:provider')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  handleWebhook(
    @Param('provider') _provider: string,
    @Body() payload: Record<string, unknown>,
    @Headers('x-payment-signature') signature?: string,
  ) {
    return this.paymentsService.handleWebhook(payload, signature);
  }

  /** Customer reports the reference of an InstaPay transfer they already made. */
  @Post('orders/:orderId/instapay')
  @HttpCode(HttpStatus.CREATED)
  submitInstapay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: SubmitInstapayReferenceDto,
  ) {
    return this.paymentsService.submitInstapayReference(user.id, orderId, dto);
  }

  /** Branch staff confirms a reported transfer against the bank statement. */
  @Post('transactions/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @Audit({ entityType: 'PaymentTransaction', action: 'MANUAL_CONFIRMATION' })
  confirmTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmTransferDto,
  ) {
    return this.paymentsService.confirmInstapayTransfer(user.id, id, dto.accept);
  }

  /** Queue of InstaPay references awaiting confirmation at one branch. */
  @Get('branch/:branchId/pending-transfers')
  pendingTransfers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ) {
    return this.paymentsService.pendingTransfersForBranch(user.id, branchId);
  }

  /** Payment detail for one order — its customer or the branch staff. */
  @Get('orders/:orderId')
  findForOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.paymentsService.findForOrder(orderId, user.id);
  }
}
