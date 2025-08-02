import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
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
    };

    const mockConfigService = {
        get: jest.fn(),
    };

    beforeEach(async () => {
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
