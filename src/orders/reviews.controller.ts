import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { SubmitReviewDto } from './dto/submit-review.dto';
import { ReviewFilterDto } from './dto/review-filter.dto';
import { Public } from '../auth/decorators/public.decorator';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequiredPermissions } from '../rbac/decorators/required-permissions.decorator';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../rbac/decorators/current-user.decorator';

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** One review per delivered order, by the customer who placed it. */
  @Post('orders/:orderId/review')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: SubmitReviewDto,
  ) {
    return this.reviews.create(user.id, orderId, dto);
  }

  /** Public branch reviews plus the rating aggregate. */
  @Get('pharmacies/branches/:branchId/reviews')
  @Public()
  findForBranch(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() filter: ReviewFilterDto,
  ) {
    return this.reviews.findForBranch(branchId, filter);
  }

  @Get('reviews/mine')
  findMine(@CurrentUser() user: AuthenticatedUser, @Query() filter: ReviewFilterDto) {
    return this.reviews.findMine(user.id, filter);
  }

  /** Moderation removal; also recomputes the branch rating. */
  @Delete('reviews/:id')
  @UseGuards(PermissionGuard)
  @RequiredPermissions('reviews.moderate')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.remove(id);
  }
}
