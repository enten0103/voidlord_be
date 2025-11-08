import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../app.controller';
import { AppService } from '../app.service';
import { DatabaseInitService } from '../../../config/database-init.service';

describe('AppController', () => {
  let appController: AppController;

  type HealthCheckFn = jest.Mock<Promise<boolean>, []>;
  const mockDatabaseInitService: { healthCheck: HealthCheckFn } = {
    healthCheck: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: DatabaseInitService,
          useValue: mockDatabaseInitService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health check', () => {
    it('should return healthy status', async () => {
      const result: Awaited<ReturnType<AppController['healthCheck']>> =
        await appController.healthCheck();
      expect(result.status).toBe('healthy');
      expect(typeof result.timestamp).toBe('string');
      expect(result.database).toBe('connected');
      expect(mockDatabaseInitService.healthCheck).toHaveBeenCalled();
    });

    it('should return unhealthy status when database is down', async () => {
      mockDatabaseInitService.healthCheck.mockResolvedValueOnce(false);
      const result: Awaited<ReturnType<AppController['healthCheck']>> =
        await appController.healthCheck();
      expect(result.status).toBe('unhealthy');
      expect(typeof result.timestamp).toBe('string');
      expect(result.database).toBe('disconnected');
    });
  });
});
