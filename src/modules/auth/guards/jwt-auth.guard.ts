import {
  Injectable,
  UnauthorizedException,
  ExecutionContext,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // 标准化未登录/无效令牌为 401，并暴露更清晰的信息
  // Keep signature compatible with generic base; do not narrow return type.

  handleRequest<TUser = any>(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
    status?: any,
  ): TUser {
    void context; // mark as used
    void status;
    if (err || !user) {
      let infoMsg = '';
      if (typeof info === 'string') infoMsg = info;
      else {
        const i: unknown = info;
        if (
          i &&
          typeof i === 'object' &&
          'message' in i &&
          typeof (i as Record<string, unknown>).message === 'string'
        ) {
          infoMsg = (i as { message: string }).message;
        }
      }
      let errMsg = '';
      if (typeof err === 'string') errMsg = err;
      else {
        const e: unknown = err;
        if (
          e &&
          typeof e === 'object' &&
          'message' in e &&
          typeof (e as Record<string, unknown>).message === 'string'
        ) {
          errMsg = (e as { message: string }).message;
        }
      }
      const message = infoMsg || errMsg || 'Unauthorized';
      throw new UnauthorizedException(message);
    }
    return user as TUser; // return generic user unchanged
  }
}
