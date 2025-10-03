import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { S3_CLIENT } from './tokens';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileObject } from '../../entities/file-object.entity';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
    imports: [ConfigModule, TypeOrmModule.forFeature([FileObject]), PermissionsModule],
    providers: [
        {
            provide: S3_CLIENT,
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const endpoint = config.get<string>('MINIO_ENDPOINT', 'http://localhost:9000');
                const accessKeyId = config.get<string>('MINIO_ACCESS_KEY', 'minioadmin');
                const secretAccessKey = config.get<string>('MINIO_SECRET_KEY', 'minioadmin');
                const forcePathStyle = config.get<boolean>('MINIO_FORCE_PATH_STYLE', true);
                const region = config.get<string>('MINIO_REGION', 'us-east-1');
                return new S3Client({
                    region,
                    endpoint,
                    credentials: { accessKeyId, secretAccessKey },
                    forcePathStyle,
                });
            },
        },
        FilesService,
    ],
    exports: [FilesService, S3_CLIENT],
    controllers: [FilesController],
})
export class FilesModule { }
