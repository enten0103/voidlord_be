// E2E测试环境设置文件
import 'reflect-metadata';

// 设置测试环境变量
process.env.NODE_ENV = 'test';

// 设置测试超时时间
jest.setTimeout(30000);
