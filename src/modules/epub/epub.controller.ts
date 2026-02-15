import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Res,
  BadRequestException,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { EpubService } from './epub.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { ApiPermission } from '../auth/permissions.decorator';
import type { JwtRequestWithUser } from '../../types/request.interface';

@ApiTags('epub')
@Controller('epub')
export class EpubController {
  constructor(private readonly epubService: EpubService) {}

  @Post('book/:id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiPermission('BOOK_UPDATE', 1)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Upload and unzip EPUB for a book' })
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadEpub(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: JwtRequestWithUser,
  ) {
    if (!file) throw new BadRequestException('File is required');
    await this.epubService.uploadEpub(id, file.buffer, req.user.userId);
    return { success: true };
  }

  @Get('book/:id/*path')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get file from unzipped EPUB' })
  @ApiParam({
    name: 'id',
    description: 'Book ID',
  })
  async getEpubFile(
    @Param('id', ParseIntPipe) id: number,
    @Param('path') path: string | string[],
    @Res() res: Response,
  ) {
    const rawPath = Array.isArray(path) ? path.join('/') : path;
    const { stream, contentType, length } = await this.epubService.getFile(
      id,
      rawPath,
    );

    if (typeof length === 'number') {
      res.set({
        'Content-Type': contentType,
        'Content-Length': length,
      });
    } else {
      res.set({
        'Content-Type': contentType,
      });
    }

    stream.pipe(res);
  }

  @Delete('book/:id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiPermission('BOOK_UPDATE', 1)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete EPUB files for a book' })
  async deleteEpub(@Param('id') id: string) {
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) {
      throw new BadRequestException('Invalid book id');
    }
    await this.epubService.deleteEpub(bookId);
    return { success: true };
  }
}
