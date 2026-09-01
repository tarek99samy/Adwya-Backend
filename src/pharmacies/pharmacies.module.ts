import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { PharmaciesController } from './pharmacies.controller';
import { PharmaciesService } from './pharmacies.service';
import { AdminPharmaciesController, OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [RbacModule],
  controllers: [PharmaciesController, OnboardingController, AdminPharmaciesController],
  providers: [PharmaciesService, OnboardingService],
  exports: [PharmaciesService], // used by orders/delivery for branch lookups
})
export class PharmaciesModule {}
