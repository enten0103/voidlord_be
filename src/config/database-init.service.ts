import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PERMISSIONS } from '../modules/auth/permissions.constants';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';
import { Permission } from '../entities/permission.entity';
import { UserPermission } from '../entities/user-permission.entity';
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

  // 供外部脚本复用
  async seedInitialData() {
    try {
      const userRepo = this.dataSource.getRepository(User);
      const permRepo = this.dataSource.getRepository(Permission);
      const userPermRepo = this.dataSource.getRepository(UserPermission);

      for (const p of PERMISSIONS) {
        const existing = await permRepo.findOne({ where: { name: p } });
        if (!existing) await permRepo.save(permRepo.create({ name: p }));
      }

      const adminUsername = this.configService.get<string>('ADMIN_USERNAME', 'admin');
      const adminEmail = this.configService.get<string>('ADMIN_EMAIL', 'admin@example.com');
      const adminPassword = this.configService.get<string>('ADMIN_PASSWORD', 'admin123');

      let admin = await userRepo.findOne({ where: { username: adminUsername } });
      if (!admin) {
        const hashed = await bcrypt.hash(adminPassword, 10);
        admin = await userRepo.save(userRepo.create({
          username: adminUsername,
          email: adminEmail,
          password: hashed,
        }));
        this.logger.log(`System admin created: username=${adminUsername}${adminPassword === 'admin123' ? ' (default password used)' : ''}`);
      }

      const allPerms = await permRepo.find();
      for (const perm of allPerms) {
        const existingUP = await userPermRepo.findOne({ where: { user: { id: admin.id }, permission: { id: perm.id } } });
        if (!existingUP) {
          await userPermRepo.save(userPermRepo.create({ user: admin, permission: perm, level: 3, grantedBy: null }));
        }
      }

      this.logger.log('Initial data seeding completed (permissions & admin)');
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
