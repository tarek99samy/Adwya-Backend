import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Egyptian phone number.
 * Accepts either the local format (`01XXXXXXXXX` — 11 digits, starts with 01)
 * or the international format (`+201XXXXXXXXX` — 13 chars, +20 prefix).
 * Whitespace is trimmed by the caller before this runs.
 */
export function isEgyptianPhone(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  return /^01[0125]\d{8}$/.test(v) || /^\+201[0125]\d{8}$/.test(v);
}

export function IsEgyptianPhone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isEgyptianPhone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return isEgyptianPhone(value);
        },
        defaultMessage(): string {
          return `${propertyName} must be a valid Egyptian phone number (01XXXXXXXXX or +201XXXXXXXXX)`;
        },
      },
    });
  };
}

/** Latitude range for WGS84. */
export const LAT_MIN = -90;
export const LAT_MAX = 90;
/** Longitude range for WGS84. */
export const LNG_MIN = -180;
export const LNG_MAX = 180;
