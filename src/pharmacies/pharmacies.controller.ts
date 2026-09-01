import {
  Controller,
  Get,
  Query,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PharmacyBranchFilterDto } from './dto/pharmacy-branch.filter-dto';
import { PharmaciesService } from './pharmacies.service';

@Controller('pharmacies')
export class PharmaciesController {
  constructor(private readonly pharmaciesService: PharmaciesService) {}

  @Get('branches')
  @Public()
  @HttpCode(HttpStatus.OK)
  findAll(@Query() filter: PharmacyBranchFilterDto) {
    return this.pharmaciesService.findAll(filter);
  }

  @Get('branches/:id')
  @Public()
  @HttpCode(HttpStatus.OK)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.pharmaciesService.findOne(id);
  }
}