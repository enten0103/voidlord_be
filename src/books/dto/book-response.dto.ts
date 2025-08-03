import { ApiProperty } from '@nestjs/swagger';
import { Tag } from '../../entities/tag.entity';

export class TagResponseDto {
    @ApiProperty({ description: 'Tag ID' })
    id: number;

    @ApiProperty({ description: 'Tag key' })
    key: string;

    @ApiProperty({ description: 'Tag value' })
    value: string;

    @ApiProperty({ description: 'Whether the tag is shown' })
    shown: boolean;

    @ApiProperty({ description: 'Tag creation date' })
    created_at: Date;

    @ApiProperty({ description: 'Tag last update date' })
    updated_at: Date;
}

export class BookResponseDto {
    @ApiProperty({ description: 'Book ID' })
    id: number;

    @ApiProperty({ description: 'Book hash' })
    hash: string;

    @ApiProperty({ description: 'Book title' })
    title: string;

    @ApiProperty({ description: 'Book description', required: false })
    description?: string;

    @ApiProperty({ description: 'Book creation date' })
    created_at: Date;

    @ApiProperty({ description: 'Book last update date' })
    updated_at: Date;

    @ApiProperty({ description: 'Associated tags', type: [TagResponseDto] })
    tags: TagResponseDto[];
}
