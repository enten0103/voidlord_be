import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DatabaseInitService implements OnModuleInit {
    private readonly logger = new Logger(DatabaseInitService.name);

    constructor(
        @InjectDataSource()
        private dataSource: DataSource,
        private configService: ConfigService,
    ) { }

    async onModuleInit() {
        // 在测试环境中跳过自动初始化
        const nodeEnv = this.configService.get<string>('NODE_ENV');

        if (nodeEnv === 'test') {
            this.logger.log('Skipping database initialization in test environment');
            return;
        }

        await this.initializeDatabase();
    }

    private async initializeDatabase() {
        try {
            this.logger.log('Initializing database connection...');

            // 检查数据库连接
            if (!this.dataSource.isInitialized) {
                await this.dataSource.initialize();
                this.logger.log('Database connection initialized successfully');
            }

            // 运行迁移（如果有）
            await this.dataSource.runMigrations();
            this.logger.log('Database migrations completed');

            // 可以在这里添加种子数据
            await this.seedInitialData();

        } catch (error) {
            this.logger.error('Failed to initialize database:', error);
            throw error;
        }
    }

    private async seedInitialData() {
        try {
            // 这里可以添加初始数据的创建逻辑
            // 例如：创建默认管理员用户等
            this.logger.log('Initial data seeding completed');
        } catch (error) {
            this.logger.error('Failed to seed initial data:', error);
            // 不抛出错误，因为种子数据失败不应该阻止应用启动
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            await this.dataSource.query('SELECT 1');
            return true;
        } catch (error) {
            this.logger.error('Database health check failed:', error);
            return false;
        }
    }
}
