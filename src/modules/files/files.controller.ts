import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FilesService } from './files.service';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { ApiPermission } from '../auth/permissions.decorator';
import { PermissionsService } from '../permissions/permissions.service';
import type { JwtRequestWithUser } from '../../types/request.interface';

@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly permissions: PermissionsService,
  ) {}

  // 生成前端直传的预签名URL
  @Get('upload-url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: '生成预签名上传URL',
    description: '用于前端直传到 MinIO（S3 兼容）。',
  })
  @ApiQuery({
    name: 'key',
    required: true,
    description: '对象键（路径/文件名）',
  })
  @ApiQuery({
    name: 'contentType',
    required: false,
    description: 'MIME 类型，如 image/png',
  })
  @ApiResponse({
    status: 200,
    description: '返回预签名URL 和 key',
    schema: {
      example: {
        url: 'http://minio/presigned/xxx',
        key: 'uploads/2025-10-06/uuid.png',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  async uploadUrl(
    @Query('key') key: string,
    @Query('contentType') contentType?: string,
  ) {
    const url = await this.files.createUploadUrl({ key, contentType });
    return { url, key };
  }

  // 简单删除
  @Delete('object')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: '删除对象（本人或拥有 FILE_MANAGE）',
    description:
      '若对象所有者为调用者本人可直接删除；否则需具备 FILE_MANAGE≥1；当对象未记录所有者时，仅允许 FILE_MANAGE。',
  })
  @ApiQuery({ name: 'key', required: true, description: '要删除的对象键' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden (not owner or missing FILE_MANAGE)',
    schema: {
      example: {
        statusCode: 403,
        message: 'Only owner or FILE_MANAGE can delete',
        error: 'Forbidden',
      },
    },
  })
  async remove(@Query('key') key: string, @Req() req: JwtRequestWithUser) {
    const currentUserId = req.user.userId;
    const ownerId = await this.files.findOwnerIdByKey(key);
    if (ownerId == null) {
      // Unknown owner: only FILE_MANAGE may delete
      const lvl = await this.permissions.getUserPermissionLevel(
        currentUserId,
        'FILE_MANAGE',
      );
      if (lvl < 1)
        throw new ForbiddenException('Only owner or FILE_MANAGE can delete');
    } else if (ownerId !== currentUserId) {
      // Not owner: require FILE_MANAGE
      const lvl = await this.permissions.getUserPermissionLevel(
        currentUserId,
        'FILE_MANAGE',
      );
      if (lvl < 1)
        throw new ForbiddenException('Only owner or FILE_MANAGE can delete');
    }
    await this.files.deleteObject(key);
    await this.files.deleteRecordByKey(key);
    return { ok: true };
  }

  // 生成下载预签名URL（不需要公开桶策略）
  @Get('download-url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: '生成预签名下载URL',
    description: '用于私有对象的临时访问。',
  })
  @ApiQuery({ name: 'key', required: true, description: '对象键' })
  @ApiQuery({
    name: 'expiresIn',
    required: false,
    description: '秒数，默认 600',
  })
  @ApiResponse({
    status: 200,
    description: '返回预签名下载URL 和 key',
    schema: {
      example: {
        url: 'http://minio/presigned-download/xxx',
        key: 'uploads/2025-10-06/uuid.png',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  async downloadUrl(
    @Query('key') key: string,
    @Query('expiresIn') expiresIn?: string,
  ) {
    const url = await this.files.createDownloadUrl(
      key,
      expiresIn ? Number(expiresIn) : 600,
    );
    return { url, key };
  }

  @Post('policy/public')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiPermission('SYS_MANAGE', 3)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: '将存储桶策略设为公开读取',
    description:
      '慎用！这将允许任何人读取桶内所有对象。需要 SYS_MANAGE 权限（level 3）。',
  })
  @ApiResponse({ status: 200, description: '策略已更新' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden (insufficient permission)',
    schema: {
      example: { statusCode: 403, message: 'Forbidden', error: 'Forbidden' },
    },
  })
  async makePublic() {
    await this.files.setBucketPolicyPublic();
    return { ok: true, message: 'Bucket policy updated to public-read.' };
  }

  @Post('policy/private')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiPermission('SYS_MANAGE', 3)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: '将存储桶策略设为私有',
    description:
      '移除所有策略，恢复默认私有状态。需要 SYS_MANAGE 权限（level 3）。',
  })
  @ApiResponse({ status: 200, description: '策略已移除' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden (insufficient permission)',
    schema: {
      example: { statusCode: 403, message: 'Forbidden', error: 'Forbidden' },
    },
  })
  async makePrivate() {
    await this.files.setBucketPolicyPrivate();
    return { ok: true, message: 'Bucket policy removed (private).' };
  }

  // 直传文件（后端转存到 MinIO）
  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage() }))
  @ApiOperation({
    summary: '上传文件',
    description: '通过后端接收 multipart/form-data 并存入 MinIO。',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: '待上传文件' },
        key: {
          type: 'string',
          nullable: true,
          description:
            '自定义对象键（不传则自动生成），例如 uploads/2025-10-06/uuid.png',
        },
        contentType: {
          type: 'string',
          nullable: true,
          description: 'MIME 类型（可选），例如 image/png, application/pdf',
        },
      },
      required: ['file'],
    },
    examples: {
      imagePng: {
        summary: '上传 PNG 图片（自动生成 key）',
        value: {},
      },
      customKeyPdf: {
        summary: '自定义 key 上传 PDF',
        value: {
          key: 'docs/manuals/voidlord.pdf',
          contentType: 'application/pdf',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: '上传成功，返回对象信息与公开 URL（如配置）。',
    schema: {
      example: {
        ok: true,
        key: 'uploads/2025-10-06/uuid.png',
        size: 123456,
        mime: 'image/png',
        url: 'http://localhost:9000/voidlord/uploads/2025-10-06/uuid.png',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: JwtRequestWithUser,
    @Body('key') key?: string,
    @Body('contentType') contentType?: string,
  ) {
    if (!file) {
      return { ok: false, message: 'file is required' };
    }
    const safeName = (file.originalname || 'file').replace(/[^\w.-]+/g, '_');
    const finalKey =
      key && key.trim().length > 0
        ? key
        : `${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeName}`;

    await this.files.putObject(
      finalKey,
      file.buffer,
      contentType || file.mimetype,
      undefined,
      req.user.userId,
    );
    const publicUrl = this.files.getPublicUrl(finalKey);
    return {
      ok: true,
      key: finalKey,
      size: file.size,
      mime: contentType || file.mimetype,
      url: publicUrl,
    };
  }
}
