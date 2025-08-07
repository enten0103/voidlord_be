import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../../users/dto/user-response.dto';

export class LoginResponseDto {
    @ApiProperty({
        description: 'JWT access token',
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    })
    access_token: string;

    @ApiProperty({
        description: 'User information',
        type: UserResponseDto,
    })
    user: {
        id: number;
        username: string;
        email: string;
    };
}
