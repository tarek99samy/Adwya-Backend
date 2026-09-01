import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '../common/enums';
import type { SubmitReviewDto } from './dto/submit-review.dto';
import type { ReviewFilterDto } from './dto/review-filter.dto';
import { OrderNotFoundException } from '../common/exceptions/commerce.exceptions';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One review per order, by the customer who placed it, only once it has been
   * delivered. `Review.orderId` is unique, so the DB is the final guard against
   * a double submission racing the check below.
   *
   * Writing a review also refreshes the branch's cached rating aggregate, in
   * the same transaction — otherwise `ratingAvg` drifts from the review rows.
   */
  async create(userId: string, orderId: string, dto: SubmitReviewDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { review: true },
    });

    if (!order || order.customerId !== userId) throw new OrderNotFoundException();
    if (order.status !== OrderStatus.DELIVERED) {
      throw new ConflictException(
        'You can review an order once it has been delivered.',
      );
    }
    if (order.review) {
      throw new ConflictException('You have already reviewed this order.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const review = await tx.review.create({
          data: {
            orderId,
            userId,
            branchId: order.branchId,
            rating: dto.rating,
            comment: dto.comment,
          },
        });

        await this.refreshBranchRating(tx, order.branchId);
        return review;
      });
    } catch (err) {
      // Lost the race against a concurrent submission for the same order.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('You have already reviewed this order.');
      }
      throw err;
    }
  }

  /** Public branch reviews, newest first. */
  async findForBranch(branchId: string, filter: ReviewFilterDto) {
    const { page = 1, limit = 20 } = filter;

    const where: Prisma.ReviewWhereInput = {
      branchId,
      ...(filter.rating ? { rating: filter.rating } : {}),
    };

    const [data, total, aggregate] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { fullName: true } } },
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.aggregate({
        where: { branchId },
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        averageRating: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(1)) : 0,
        reviewCount: aggregate._count,
      },
    };
  }

  /** The caller's own reviews. */
  async findMine(userId: string, filter: ReviewFilterDto) {
    const { page = 1, limit = 20 } = filter;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where: { userId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { order: { select: { id: true, orderNumber: true } } },
      }),
      this.prisma.review.count({ where: { userId } }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  /**
   * Moderation removal (permission `reviews.moderate`). Deleting rather than
   * flagging, because the schema has no hidden column — and the branch
   * aggregate is recomputed so a removed review stops counting.
   */
  async remove(reviewId: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new ConflictException('Review not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id: reviewId } });
      await this.refreshBranchRating(tx, review.branchId);
      return { removed: true, reviewId };
    });
  }

  /**
   * Recomputes `PharmacyBranch.ratingAvg` / `ratingCount` from the review rows.
   * Cheap at branch scale and always correct, which beats incrementally
   * nudging a running average that can drift after a deletion.
   */
  private async refreshBranchRating(tx: Prisma.TransactionClient, branchId: string) {
    const aggregate = await tx.review.aggregate({
      where: { branchId },
      _avg: { rating: true },
      _count: true,
    });

    await tx.pharmacyBranch.update({
      where: { id: branchId },
      data: {
        ratingAvg: aggregate._avg.rating ?? 0,
        ratingCount: aggregate._count,
      },
    });
  }
}
