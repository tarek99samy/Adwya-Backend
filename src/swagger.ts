import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';

/**
 * Serves the OpenAPI document at /api/docs (JSON at /api/docs-json).
 *
 * DTOs carry no `@ApiProperty` decorators; the Nest CLI plugin configured in
 * `nest-cli.json` derives them from the TypeScript types and class-validator
 * decorators instead, so the schema stays correct without a second set of
 * annotations to keep in sync.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Adwya API')
    .setDescription(
      [
        'Backend for Adwya, a pharmacy-delivery marketplace.',
        '',
        'Every endpoint requires a bearer token unless marked otherwise.',
        'Obtain one from `POST /auth/login`; it expires in 15 minutes and is',
        'renewed through `POST /auth/refresh`, which rotates the refresh token.',
        '',
        'Errors share one envelope:',
        '`{ statusCode, timestamp, path, error: { message, code? } }`.',
        'Domain failures carry a stable `code` (for example `INSUFFICIENT_STOCK`,',
        '`CART_BRANCH_MISMATCH`) that clients should branch on rather than',
        'matching the human-readable message.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .addTag('auth', 'Login, signup, token refresh, password reset')
    .addTag('catalog', 'Public medicine, category and brand browsing')
    .addTag('pharmacies', 'Branch discovery, onboarding and staff')
    .addTag('cart', 'Branch-scoped shopping cart')
    .addTag('orders', 'Checkout, order lifecycle, prescriptions, delivery')
    .addTag('payments', 'Payment intents, webhooks, InstaPay transfers')
    .addTag('refunds', 'Admin refund workflow')
    .addTag('inventory', 'Pharmacy-side stock, batches and pricing')
    .addTag('admin', 'Platform administration')
    .addTag('health', 'Liveness and readiness probes')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      // Keeps the token across page reloads — the single biggest annoyance
      // when exercising an authenticated API by hand.
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'Adwya API',
  });
}
