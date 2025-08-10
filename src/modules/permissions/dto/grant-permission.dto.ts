import { IsIn, IsInt, IsPositive, Min } from 'class-validator';
import { PERMISSIONS } from '../../auth/permissions.constants';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class GrantPermissionDto {
    @ApiProperty({ description: '目标用户ID (被授予者)', example: 12, minimum: 1 })
    @Type(() => Number)
    @IsPositive()
    userId: number;

    @ApiProperty({ description: '权限名称', enum: PERMISSIONS, example: 'USER_READ' })
    @IsIn(PERMISSIONS)
    permission: string;

    @ApiProperty({ description: '授予等级 (1=基础 2=可授予/撤销其授予的level1 3=完全)', example: 1, minimum: 1, maximum: 3 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    level: number; // 1,2,3
}
