import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
    HeadBucketCommand,
    CreateBucketCommand,
    GetObjectCommand,
    PutBucketPolicyCommand,
    DeleteBucketPolicyCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3_CLIENT } from './tokens';

export interface PresignedUrlOptions {
    bucket?: string;
    key: string;
    expiresIn?: number; // seconds
    contentType?: string;
}

@Injectable()
export class FilesService implements OnModuleInit {
    private defaultBucket: string;
    private readonly logger = new Logger(FilesService.name);
    constructor(
        @Inject(S3_CLIENT) private s3: S3Client,
        private config: ConfigService,
    ) {
        this.defaultBucket = this.config.get<string>('MINIO_BUCKET', 'voidlord');
    }

    async onModuleInit() {
        const bucket = this.getBucket();
        try {
            await this.s3.send(new HeadBucketCommand({ Bucket: bucket }));
        } catch (e) {
            try {
                await this.s3.send(new CreateBucketCommand({ Bucket: bucket }));
                this.logger.log(`Created bucket: ${bucket}`);
            } catch (err) {
                this.logger.error(`Ensure bucket failed: ${bucket}`, err as any);
            }
        }
    }

    getBucket(bucket?: string) {
        return bucket || this.defaultBucket;
    }

    async ensureObjectExists(bucket: string, key: string): Promise<boolean> {
        try {
            await this.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
            return true;
        } catch (e) {
            return false;
        }
    }

    async putObject(
        key: string,
        body: Buffer | Uint8Array | Blob | string,
        contentType?: string,
        bucket?: string,
    ): Promise<string> {
        const Bucket = this.getBucket(bucket);
        await this.s3.send(
            new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }),
        );
        return key;
    }

    async deleteObject(key: string, bucket?: string): Promise<void> {
        const Bucket = this.getBucket(bucket);
        await this.s3.send(new DeleteObjectCommand({ Bucket, Key: key }));
    }

    async createUploadUrl(options: PresignedUrlOptions): Promise<string> {
        const Bucket = this.getBucket(options.bucket);
        const cmd = new PutObjectCommand({
            Bucket,
            Key: options.key,
            ContentType: options.contentType,
        });
        return getSignedUrl(this.s3, cmd, { expiresIn: options.expiresIn ?? 600 });
    }

    async createDownloadUrl(key: string, expiresIn = 600, bucket?: string): Promise<string> {
        const Bucket = this.getBucket(bucket);
        const cmd = new GetObjectCommand({ Bucket, Key: key });
        return getSignedUrl(this.s3, cmd, { expiresIn });
    }

    getPublicUrl(key: string, bucket?: string): string {
        const endpoint = this.config.get<string>('MINIO_PUBLIC_ENDPOINT') ||
            this.config.get<string>('MINIO_ENDPOINT', 'http://localhost:9000');
        const Bucket = this.getBucket(bucket);
        // path-style URL: http://host/bucket/key
        const encodedKey = key
            .split('/')
            .map((seg) => encodeURIComponent(seg))
            .join('/');
        return `${endpoint.replace(/\/$/, '')}/${Bucket}/${encodedKey}`;
    }

    async setBucketPolicyPublic(bucket?: string) {
        const Bucket = this.getBucket(bucket);
        const policy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Sid: 'PublicReadGetObject',
                    Effect: 'Allow',
                    Principal: '*',
                    Action: ['s3:GetObject'],
                    Resource: [`arn:aws:s3:::${Bucket}/*`],
                },
            ],
        };
        await this.s3.send(
            new PutBucketPolicyCommand({
                Bucket,
                Policy: JSON.stringify(policy),
            }),
        );
        this.logger.log(`Bucket ${Bucket} policy set to public-read`);
    }

    async setBucketPolicyPrivate(bucket?: string) {
        const Bucket = this.getBucket(bucket);
        await this.s3.send(new DeleteBucketPolicyCommand({ Bucket }));
        this.logger.log(`Bucket ${Bucket} policy removed (set to private)`);
    }
}
