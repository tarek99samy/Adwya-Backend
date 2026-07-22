export class CartItemResponseDto {
  id!: string;
  medicineId!: string;
  quantity!: number;
}

export class CartResponseDto {
  id!: string;
  userId!: string;
  branchId?: string | null;
  updatedAt!: Date;
  items!: CartItemResponseDto[];
}
