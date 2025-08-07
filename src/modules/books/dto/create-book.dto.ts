import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateTagDto {
    @ApiProperty({ description: 'Tag key', example: 'author' })
    @IsNotEmpty()
    @IsString()
    key: string;

    @ApiProperty({ description: 'Tag value', example: 'John Doe' })
    @IsNotEmpty()
    @IsString()
    value: string;

    @ApiProperty({ description: 'Whether the tag is shown', default: true, required: false })
    @IsOptional()
    shown?: boolean;
}

export class CreateBookDto {
    @ApiProperty({ description: 'Book hash', example: 'abc123def456' })
    @IsNotEmpty()
    @IsString()
    hash: string;

    @ApiProperty({ description: 'Book title', example: 'The Great Gatsby' })
    @IsNotEmpty()
    @IsString()
    title: string;

    @ApiProperty({ description: 'Book description', required: false, example: 'A classic novel' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({
        description: 'Tags associated with the book',
        type: [CreateTagDto],
        required: false
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateTagDto)
    tags?: CreateTagDto[];
}
