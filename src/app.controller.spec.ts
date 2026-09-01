import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

/**
 * AppController is an empty root controller — the scaffold's `getHello()` was
 * removed when the real feature modules landed, and `/healthz` is served from
 * the express adapter in `main.ts` rather than from here. This spec exists to
 * keep the root module wiring honest, not to assert behaviour it no longer has.
 */
describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('is instantiable with AppService injected', () => {
    expect(appController).toBeDefined();
    expect(appController).toBeInstanceOf(AppController);
  });
});
