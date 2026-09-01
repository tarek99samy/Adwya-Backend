import { OmitType } from '@nestjs/swagger';  // swagger's variant keeps the schema metadata
import { RegisterPharmacyDto } from './register-pharmacy.dto';

/**
 * An existing pharmacy opening another branch. Reuses the branch half of the
 * registration payload — pharmacy identity comes from the path, and the owner
 * already has an account.
 */
export class CreateBranchDto extends OmitType(RegisterPharmacyDto, [
  'name',
  'nameAr',
  'taxNumber',
  'ownerName',
  'ownerPhone',
  'ownerEmail',
  'ownerPassword',
] as const) {}
