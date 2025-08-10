import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { DatabaseInitService } from './database-init.service';

describe('DatabaseInitService', () => {
  let service: DatabaseInitService;
  let dataSource: jest.Mocked<DataSource>;
  let configService: jest.Mocked<ConfigService>;

  const mockDataSource = {
    isInitialized: true,
    initialize: jest.fn(),
    runMigrations: jest.fn(),
    query: jest.fn(),
    // 将在 beforeEach 中重置
    getRepository: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    // 为每次测试构建独立的仓库 mock，避免跨测试状态污染
    const buildRepo = () => {
      const store: any[] = [];
      return {
        create: jest.fn((entity: any) => ({ ...entity })),
        findOne: jest.fn(async ({ where }: any) => {
          const entries = Object.entries(where || {});
          return store.find(item => entries.every(([k, v]) => item?.[k] === v)) || null;
        }),
        save: jest.fn(async (entity: any) => {
          if (!entity.id) entity.id = store.length + 1;
          store.push(entity);
          return entity;
        }),
        find: jest.fn(async () => [...store]),
      };
    };

    const userRepo = buildRepo();
    const permRepo = buildRepo();
    const userPermRepo = buildRepo();

    mockDataSource.getRepository.mockImplementation((target: any) => {
      switch (target?.name) {
        case 'User':
          return userRepo;
        case 'Permission':
          return permRepo;
        case 'UserPermission':
          return userPermRepo;
        default:
          // 返回一个通用 repo，保证不会抛错
          return buildRepo();
      }
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseInitService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<DatabaseInitService>(DatabaseInitService);
    dataSource = module.get(DataSource);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('healthCheck', () => {
    it('should return true when database is healthy', async () => {
      mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);

      const result = await service.healthCheck();

      expect(result).toBe(true);
      expect(mockDataSource.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return false when database is unhealthy', async () => {
      mockDataSource.query.mockRejectedValue(new Error('Connection failed'));

      const result = await service.healthCheck();
      expect(result).toBe(false);
      expect(mockDataSource.query).toHaveBeenCalledWith('SELECT 1');
    });
  });

  describe('onModuleInit', () => {
    it('should skip initialization in test environment', async () => {
      mockConfigService.get.mockReturnValue('test');

      await service.onModuleInit();

      expect(mockDataSource.initialize).not.toHaveBeenCalled();
      expect(mockDataSource.runMigrations).not.toHaveBeenCalled();
    });

    it('should initialize database when not initialized', async () => {
      mockConfigService.get.mockReturnValue('development');
      mockDataSource.isInitialized = false;
      mockDataSource.initialize.mockResolvedValue(undefined);
      mockDataSource.runMigrations.mockResolvedValue([]);

      await service.onModuleInit();

      expect(mockDataSource.initialize).toHaveBeenCalled();
      expect(mockDataSource.runMigrations).toHaveBeenCalled();
    });

    it('should skip initialization when already initialized', async () => {
      mockConfigService.get.mockReturnValue('development');
      mockDataSource.isInitialized = true;
      mockDataSource.runMigrations.mockResolvedValue([]);

      await service.onModuleInit();

      expect(mockDataSource.initialize).not.toHaveBeenCalled();
      expect(mockDataSource.runMigrations).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      mockConfigService.get.mockReturnValue('development');
      mockDataSource.isInitialized = false;
      mockDataSource.initialize.mockRejectedValue(new Error('Init failed'));

      await expect(service.onModuleInit()).rejects.toThrow('Init failed');
    });
  });
});
