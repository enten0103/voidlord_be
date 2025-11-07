import { SetMetadata, applyDecorators } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

export const PERMISSION_KEY = 'required_permission';

/**
 * 基础权限元数据装饰器
 */
export const RequirePermission = (permission: string, minLevel = 1) =>
  SetMetadata(PERMISSION_KEY, { permission, minLevel });

/**
 * 组合装饰器: 同时设置权限并把要求附加到 swagger 描述中
 */
export const ApiPermission = (permission: string, minLevel = 1) =>
  applyDecorators(
    RequirePermission(permission, minLevel),
    ApiExtension('x-permission', { permission, minLevel }),
  );
