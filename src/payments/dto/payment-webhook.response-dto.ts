export class PaymentWebhookResponseDto {
  id!: string;
  provider!: string;
  payload!: Record<string, unknown>;
  signatureValid!: boolean;
  processedAt?: string; // ISO 8601
  createdAt!: string; // ISO 8601
}
