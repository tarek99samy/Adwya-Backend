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
import { MedicineFilterDto } from './dto/medicine.filter-dto';
import { CatalogService } from './catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('medicines')
  @Public()
  @HttpCode(HttpStatus.OK)
  async getMedicines(@Query() filter: MedicineFilterDto) {
    return this.catalogService.findAll(filter);
  }

  @Get('medicines/:id')
  @Public()
  @HttpCode(HttpStatus.OK)
  async getMedicine(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.findOne(id);
  }

  @Get('categories')
  @Public()
  @HttpCode(HttpStatus.OK)
  async getCategories() {
    return this.catalogService.findCategories();
  }

  @Get('brands')
  @Public()
  @HttpCode(HttpStatus.OK)
  async getBrands() {
    return this.catalogService.findBrands();
  }
}