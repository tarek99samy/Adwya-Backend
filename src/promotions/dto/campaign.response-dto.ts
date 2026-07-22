export class CampaignResponseDto {
  id!: string;
  name!: string;
  description?: string;
  startDate!: string; // ISO 8601
  endDate!: string; // ISO 8601
}
