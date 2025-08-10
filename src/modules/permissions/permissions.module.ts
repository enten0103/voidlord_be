import { Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';
import { AuthModule } from '../auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from '../../entities/permission.entity';
import { UserPermission } from '../../entities/user-permission.entity';

@Module({
    imports: [AuthModule, TypeOrmModule.forFeature([Permission, UserPermission])],
    controllers: [PermissionsController],
    providers: [PermissionsService],
    exports: [PermissionsService],
})
export class PermissionsModule { }
