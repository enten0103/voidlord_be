import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserConfig } from '../../entities/user-config.entity';
import { User } from '../../entities/user.entity';
import { UserConfigController } from './user-config.controller';
import { UserConfigService } from './user-config.service';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [TypeOrmModule.forFeature([UserConfig, User]), FilesModule],
  controllers: [UserConfigController],
  providers: [UserConfigService],
  exports: [UserConfigService],
})
export class UserConfigModule {}
