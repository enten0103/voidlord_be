import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpdateSectionDto {
    @ApiProperty({ required: false, description: 'Unique key, lowercase letters, numbers, underscore' })
    @IsOptional()
    @IsString()
    @Matches(/^[a-z0-9_]+$/)
    @Length(2, 64)
    key?: string;

    @ApiProperty({ required: false, description: 'Display title' })
    @IsOptional()
    @IsString()
    @Length(1, 128)
    title?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsInt()
    sort_order?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsBoolean()
    active?: boolean;

    @ApiProperty({ description: 'Optional reorder of section ids (for batch sorting)', required: false, type: [Number] })
    @IsOptional()
    @IsArray()
    sectionOrder?: number[];
}
