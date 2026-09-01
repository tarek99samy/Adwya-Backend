import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../rbac/decorators/current-user.decorator';

/**
 * The cart is implicit per authenticated user — there is no cart id in any
 * path. Every route requires a token (the global JwtAuthGuard covers this).
 */
@Controller('cart')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@CurrentUser() user: AuthenticatedUser) {
    return this.cartService.getCart(user.id);
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  addItem(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user.id, dto);
  }

  /**
   * Discards the cart and re-scopes it to the branch stocking the given
   * medicine. This is the deliberate second step after a 409
   * CART_BRANCH_MISMATCH — the client prompts, the user confirms, then calls
   * this. Nothing is ever cleared without that confirmation.
   */
  @Post('switch-branch')
  @HttpCode(HttpStatus.OK)
  switchBranch(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddCartItemDto) {
    return this.cartService.switchBranch(user.id, dto);
  }

  @Patch('items/:id')
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(user.id, id, dto);
  }

  @Delete('items/:id')
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cartService.removeItem(user.id, id);
  }

  @Delete()
  clear(@CurrentUser() user: AuthenticatedUser) {
    return this.cartService.clear(user.id);
  }
}
