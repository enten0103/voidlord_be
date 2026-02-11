import {
    Controller,
    Post,
    Get,
    Param,
    ParseIntPipe,
    UseGuards,
    Req,
    Res,
    Query,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { ApiPermission } from '../auth/permissions.decorator';
import type { JwtRequestWithUser } from '../../types/request.interface';
import { TonoService } from './tono.service';

@ApiTags('tono')
@Controller('tono')
export class TonoController {
    constructor(private readonly tono: TonoService) { }

    @Post('book/:id/parse')
    @UseGuards(JwtAuthGuard, PermissionGuard)
    @ApiPermission('BOOK_UPDATE', 1)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({
        summary: 'Parse EPUB and generate Tono widgets (server-side) for a book',
    })
    @ApiParam({ name: 'id', description: 'Book ID', type: Number })
    @ApiResponse({
        status: 200,
        description: 'Tono generated',
        schema: { example: { hash: 'book-12' } },
    })
    async parseBook(
        @Param('id', ParseIntPipe) id: number,
        @Req() req: JwtRequestWithUser,
        @Query('async') asyncParse?: string,
        @Query('force') force?: string,
        @Query('variant') variant?: string,
    ): Promise<unknown> {
        void req; // reserved for future ownership checks
        const forceParse = force === 'true';
        const useAsync = asyncParse !== 'false';
        if (useAsync) {
            return this.tono.startParseJob(id, { force: forceParse, variant });
        }
        return this.tono.parseBookToTono(id, { force: forceParse, variant });
    }

    @Get('book/:id/instances')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'List reader instances for a book' })
    @ApiParam({ name: 'id', description: 'Book ID', type: Number })
    listInstances(@Param('id', ParseIntPipe) id: number) {
        return this.tono.listInstances(id);
    }

    @Get('jobs/:jobId')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Get async parse job status' })
    @ApiParam({ name: 'jobId', description: 'Job ID', type: String })
    @ApiResponse({
        status: 200,
        description: 'Job status returned',
        schema: {
            oneOf: [
                {
                    title: 'Pending or running',
                    example: { status: 'running', expiresAt: 1738963200000 },
                },
                {
                    title: 'Done',
                    example: { status: 'done', result: { hash: 'book-12' } },
                },
                {
                    title: 'Error',
                    example: { status: 'error', error: 'Invalid EPUB file' },
                },
                {
                    title: 'Expired',
                    example: { status: 'expired', expiresAt: 1738963200000 },
                },
            ],
        },
    })
    @ApiResponse({
        status: 404,
        description: 'Job not found or expired',
        schema: {
            example: { statusCode: 404, message: 'Job not found', error: 'Not Found' },
        },
    })
    getJob(@Param('jobId') jobId: string): Promise<unknown> {
        return Promise.resolve(this.tono.getJob(jobId));
    }

    @Get(':hash')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Get Tono JSON by hash' })
    @ApiParam({ name: 'hash', description: 'Tono hash', type: String })
    getTono(@Param('hash') hash: string): Promise<unknown> {
        return this.tono.getTono(hash);
    }

    @Get(':hash/widgets/*path')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Get Tono widget JSON by id' })
    @ApiParam({ name: 'hash', description: 'Tono hash', type: String })
    async getWidget(
        @Param('hash') hash: string,
        @Param('path') path: string | string[],
    ): Promise<unknown> {
        const rawPath = Array.isArray(path) ? path.join('/') : path;
        return this.tono.getWidget(hash, rawPath);
    }

    @Get(':hash/assets/:id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Get Tono asset bytes by id' })
    @ApiParam({ name: 'hash', description: 'Tono hash', type: String })
    @ApiParam({ name: 'id', description: 'Asset id', type: String })
    async getAsset(
        @Param('hash') hash: string,
        @Param('id') id: string,
        @Res() res: Response,
    ): Promise<void> {
        const { body, type, length } = await this.tono.getAsset(hash, id);
        res.set({ 'Content-Type': type });
        if (typeof length === 'number') {
            res.set({ 'Content-Length': length });
        }
        body.pipe(res);
    }

    @Get(':hash/fonts')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'List Tono font ids' })
    @ApiParam({ name: 'hash', description: 'Tono hash', type: String })
    getFontList(@Param('hash') hash: string): Promise<string[]> {
        return this.tono.getFontList(hash);
    }

    @Get(':hash/fonts/:id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Get Tono font bytes by id' })
    @ApiParam({ name: 'hash', description: 'Tono hash', type: String })
    @ApiParam({ name: 'id', description: 'Font id', type: String })
    async getFont(
        @Param('hash') hash: string,
        @Param('id') id: string,
        @Res() res: Response,
    ): Promise<void> {
        const { body, type, length } = await this.tono.getFont(hash, id);
        res.set({ 'Content-Type': type });
        if (typeof length === 'number') {
            res.set({ 'Content-Length': length });
        }
        body.pipe(res);
    }
}
