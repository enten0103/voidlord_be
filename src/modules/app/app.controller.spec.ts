import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseInitService } from '../../config/database-init.service';

describe('AppController', () => {
  let appController: AppController;

  const mockDatabaseInitService = {
    healthCheck: jest.fn().mockResolvedValue(true),
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
      const result = await appController.healthCheck();

      expect(result).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        database: 'connected',
      });
      expect(mockDatabaseInitService.healthCheck).toHaveBeenCalled();
    });

    it('should return unhealthy status when database is down', async () => {
      mockDatabaseInitService.healthCheck.mockResolvedValueOnce(false);

      const result = await appController.healthCheck();

      expect(result).toEqual({
        status: 'unhealthy',
        timestamp: expect.any(String),
        database: 'disconnected',
      });
    });
  });
});
