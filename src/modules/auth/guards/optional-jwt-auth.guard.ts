import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// 可选 JWT 认证：有令牌则解析并注入 req.user；没有令牌或令牌无效则保持匿名，不抛 401
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
    status?: any,
  ): TUser {
    void err;
    void info;
    void context;
    void status; // ignore
    // user 存在则返回，不存在直接返回 undefined (按 any 处理)
    return user as TUser;
  }
}
