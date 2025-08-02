import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { User } from '../src/entities/user.entity';

export async function createTestModule(): Promise<TestingModule> {
    return Test.createTestingModule({
        imports: [
            ConfigModule.forRoot({
                envFilePath: '.env.test',
                isGlobal: true,
            }),
            TypeOrmModule.forRoot({
                type: 'postgres',
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '5432'),
                username: process.env.DB_USERNAME || 'postgres',
                password: process.env.DB_PASSWORD || 'postgres',
                database: process.env.DB_NAME || 'voidlord_test',
                entities: [User],
                synchronize: true,
                dropSchema: true, // 每次测试都重新创建数据库结构
            }),
            TypeOrmModule.forFeature([User]),
        ],
    }).compile();
}
