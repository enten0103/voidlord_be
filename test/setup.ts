// E2E测试环境设置文件
import 'reflect-metadata';

// 设置测试环境变量
process.env.NODE_ENV = 'test';
// 覆盖数据库连接到测试库（docker-compose 中 postgres-test -> 5433）
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5433';
process.env.DB_USERNAME = process.env.DB_USERNAME || 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';
process.env.DB_NAME = process.env.DB_NAME || 'voidlord_test';
process.env.DB_SYNCHRONIZE = 'true';

// 设置测试超时时间
jest.setTimeout(30000);
