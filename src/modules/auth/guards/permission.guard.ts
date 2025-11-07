import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../permissions.decorator';
import { DataSource } from 'typeorm';
import { UserPermission } from '../../../entities/user-permission.entity';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<{
      permission: string;
      minLevel: number;
    }>(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!meta) return true; // no permission required
    const { permission, minLevel } = meta;
    const request = context.switchToHttp().getRequest();
    const user = request.user; // set by JwtStrategy
    if (!user?.userId) throw new UnauthorizedException('Unauthorized');

    // 使用查询构建器以避免 relation where 在某些测试环境下解析失败
    const qb = this.dataSource
      .getRepository(UserPermission)
      .createQueryBuilder('up')
      .innerJoin('up.permission', 'p')
      .innerJoin('up.user', 'u')
      .where('u.id = :uid AND p.name = :perm', {
        uid: user.userId,
        perm: permission,
      })
      .select(['up.level AS level']);
    const raw = await qb.getRawOne<{ level: number }>();
    const level = raw?.level || 0;
    if (level < minLevel) {
      Logger.warn(
        `Permission denied: user ${user.userId} level ${level} < required ${minLevel} for ${permission}`,
        'PermissionGuard',
      );
      throw new ForbiddenException(
        `Need permission ${permission} (level >= ${minLevel})`,
      );
    }
    return true;
  }
}
