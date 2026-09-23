import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('liveness', () => {
    it('returns the API liveness state', () => {
      expect(appController.getLiveness()).toMatchObject({
        service: 'api',
        status: 'ok',
      });
    });
  });

  describe('readiness', () => {
    it('returns the API readiness state', () => {
      expect(appController.getReadiness()).toMatchObject({
        service: 'api',
        status: 'ok',
        checks: {
          configuration: 'ok',
        },
      });
    });
  });
});
