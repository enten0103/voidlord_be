import { IsIn, IsPositive } from 'class-validator';
import { PERMISSIONS } from '../../auth/permissions.constants';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RevokePermissionDto {
    @ApiProperty({ description: '目标用户ID (被撤销者)', example: 12, minimum: 1 })
    @Type(() => Number)
    @IsPositive()
    userId: number;

    @ApiProperty({ description: '权限名称', enum: PERMISSIONS, example: 'USER_READ' })
    @IsIn(PERMISSIONS)
    permission: string;
}
