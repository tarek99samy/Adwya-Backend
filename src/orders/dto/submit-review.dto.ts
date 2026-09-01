import { PickType } from '@nestjs/mapped-types';
import { CreateReviewDto } from './create-review.dto';

/**
 * Body for POST /orders/:id/review.
 *
 * `CreateReviewDto` takes orderId / userId / branchId, which is right for an
 * admin-side create but wrong over the wire: the order comes from the path,
 * the author from the token, and the branch is read off the order. Accepting
 * them from the client would let someone review on another user's behalf.
 */
export class SubmitReviewDto extends PickType(CreateReviewDto, [
  'rating',
  'comment',
] as const) {}
