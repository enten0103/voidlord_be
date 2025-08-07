import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
    @ApiProperty({
        description: 'User ID',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'Username',
        example: 'john_doe',
    })
    username: string;

    @ApiProperty({
        description: 'Email address',
        example: 'john@example.com',
    })
    email: string;

    @ApiProperty({
        description: 'Account creation date',
        example: '2023-01-01T00:00:00.000Z',
    })
    created_at: Date;

    @ApiProperty({
        description: 'Last update date',
        example: '2023-01-01T00:00:00.000Z',
    })
    updated_at: Date;
}
