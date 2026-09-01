import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { SetInventoryDto } from './dto/set-inventory.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { ReceiveBatchDto } from './dto/receive-batch.dto';
import { TransferBatchDto } from './dto/transfer-batch.dto';
import { InventoryFilterDto } from './dto/inventory-filter.dto';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { Audit } from '../audit/audit.decorator';
import type { AuthenticatedUser } from '../rbac/decorators/current-user.decorator';

/**
 * Pharmacy-side stock management. Every route resolves authority from the
 * caller's PharmacyStaff row at the branch in the path — there is no
 * cross-branch access.
 */
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('branches/:branchId')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() filter: InventoryFilterDto,
  ) {
    return this.inventoryService.listForBranch(user.id, branchId, filter);
  }

  /** Sets shelf price / availability. Quantity is not settable here. */
  @Put('branches/:branchId')
  @Audit({ entityType: 'BranchInventory', action: 'UPDATE', idParam: 'branchId' })
  setInventory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: SetInventoryDto,
  ) {
    return this.inventoryService.setInventory(user.id, branchId, dto);
  }

  /** Stock-take correction; writes an ADJUSTMENT movement carrying the delta. */
  @Post('branches/:branchId/adjust')
  @HttpCode(HttpStatus.OK)
  @Audit({ entityType: 'BranchInventory', action: 'STOCK_ADJUSTMENT', idParam: 'branchId' })
  adjust(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.inventoryService.adjustStock(
      user.id,
      branchId,
      dto.medicineId,
      dto.countedQuantity,
      dto.reason,
    );
  }

  /** Goods-in, at a warehouse or straight at a branch. */
  @Post('batches')
  @HttpCode(HttpStatus.CREATED)
  receiveBatch(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReceiveBatchDto) {
    return this.inventoryService.receiveBatch(user.id, dto);
  }

  /** Warehouse batch to branch shelf. */
  @Post('transfers')
  @HttpCode(HttpStatus.CREATED)
  transfer(@CurrentUser() user: AuthenticatedUser, @Body() dto: TransferBatchDto) {
    return this.inventoryService.transferToBranch(user.id, dto);
  }

  /** FEFO working list — batches nearest expiry first. */
  @Get('branches/:branchId/expiring')
  expiring(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query('withinDays', new ParseIntPipe({ optional: true })) withinDays?: number,
  ) {
    return this.inventoryService.expiringBatches(user.id, branchId, withinDays ?? 90);
  }

  /** Movement ledger for one medicine at a branch. */
  @Get('branches/:branchId/movements/:medicineId')
  movements(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('medicineId', ParseUUIDPipe) medicineId: string,
  ) {
    return this.inventoryService.movements(user.id, branchId, medicineId);
  }
}
