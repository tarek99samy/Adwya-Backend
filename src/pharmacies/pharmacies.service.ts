import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PharmacyBranchFilterDto } from './dto/pharmacy-branch.filter-dto';
import type { Prisma } from '@prisma/client';
import { BranchStatus } from '../common/enums';

const EARTH_RADIUS_METERS = 6_371_000;

@Injectable()
export class PharmaciesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: PharmacyBranchFilterDto) {
    const { pharmacyId, nearLatitude, nearLongitude, radiusMeters } = filter;

    // This route is public, so the status is forced rather than taken from the
    // query: a branch that is PENDING_APPROVAL, REJECTED or SUSPENDED must
    // never surface in customer search, and a client must not be able to opt
    // out of that by passing ?status=. Staff read their own branches through
    // the authenticated pharmacy endpoints instead.
    const where: Prisma.PharmacyBranchWhereInput = {
      deletedAt: null,
      status: BranchStatus.APPROVED,
    };
    if (pharmacyId) {
      where.pharmacyId = pharmacyId;
    }

    const branches = await this.prisma.pharmacyBranch.findMany({
      where,
      include: { pharmacy: true },
      orderBy: { name: 'asc' },
    });

    const filteringByDistance =
      nearLatitude !== undefined && nearLongitude !== undefined && radiusMeters !== undefined;

    if (!filteringByDistance) {
      return branches;
    }

    // Haversine in-process until PostGIS lands. Fine at current branch counts;
    // revisit with a bounding-box pre-filter in SQL once the table grows.
    return branches
      .map((branch) => ({
        ...branch,
        distanceMeters: haversineMeters(
          Number(branch.latitude),
          Number(branch.longitude),
          nearLatitude,
          nearLongitude,
        ),
      }))
      .filter((branch) => branch.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  async findOne(id: string) {
    // Same reasoning as findAll: only an approved branch is publicly visible.
    const branch = await this.prisma.pharmacyBranch.findFirst({
      where: { id, deletedAt: null, status: BranchStatus.APPROVED },
      include: { pharmacy: true },
    });

    if (!branch) {
      throw new NotFoundException(`Pharmacy branch with ID ${id} not found`);
    }

    return branch;
  }
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;

  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
