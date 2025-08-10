import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class AddItemDto {
    @ApiProperty({ description: 'Book ID to add' })
    @IsInt()
    bookId: number;

    @ApiProperty({ description: 'Desired position (if omitted append to end)', required: false })
    @IsOptional()
    @IsInt()
    position?: number;

    @ApiProperty({ description: 'Optional note shown with the book', required: false })
    @IsOptional()
    @IsString()
    note?: string;
}
