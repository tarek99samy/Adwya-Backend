export class NotificationResponseDto {
  id!: string;
  userId!: string;
  templateId?: string | null;
  title!: string;
  body!: string;
  type!: string;
  isRead!: boolean;
  createdAt!: Date;
}
