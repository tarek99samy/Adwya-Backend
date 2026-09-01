import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MedicineFilterDto } from './dto/medicine.filter-dto';
import type { Prisma } from '@prisma/client';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: MedicineFilterDto) {
    const {
      categoryId,
      brandId,
      manufacturerId,
      requiresPrescription,
      search,
      page = 1,
      limit = 20,
    } = filter;

    const skip = (page - 1) * limit;
    const take = limit;

    // Soft-deleted medicines must never surface in the public catalog.
    const where: Prisma.MedicineWhereInput = { deletedAt: null };

    if (categoryId) {
      where.categoryId = categoryId;
    }
    if (brandId) {
      where.brandId = brandId;
    }
    if (manufacturerId) {
      where.manufacturerId = manufacturerId;
    }
    if (requiresPrescription !== undefined && requiresPrescription !== null) {
      where.requiresPrescription = requiresPrescription;
    }
    if (search) {
      // Search on name, genericName, barcode
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { genericName: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.medicine.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
        include: {
          brand: true,
          category: true,
          manufacturer: true,
        },
      }),
      this.prisma.medicine.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
      },
    };
  }

  async findOne(id: string) {
    const medicine = await this.prisma.medicine.findFirst({
      where: { id, deletedAt: null },
      include: {
        brand: true,
        category: true,
        manufacturer: true,
      },
    });

    if (!medicine) {
      throw new NotFoundException(`Medicine with ID ${id} not found`);
    }

    return medicine;
  }

  async findCategories() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findBrands() {
    return this.prisma.brand.findMany({
      orderBy: { name: 'asc' },
    });
  }
}
