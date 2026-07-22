import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateNotificationTemplateDto } from './create-notification-template.dto';

// `code` is the stable identifier referenced by the rest of the system —
// renaming it would orphan in-flight references in queued notifications,
// logs, and analytics. Create a new template and migrate instead.
export class UpdateNotificationTemplateDto extends PartialType(
  OmitType(CreateNotificationTemplateDto, ['code'] as const),
) {}
