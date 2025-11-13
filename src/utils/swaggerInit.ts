import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PERMISSIONS } from '../modules/auth/permissions.constants';

export const swaggerInit = (app: INestApplication) => {
  const host = process.env.PUBLIC_HOST_IP;
  const port = process.env.PORT || '3000';
  const permissionsList = PERMISSIONS.map((p) => `- ${p}`).join('\n');
  const levelExplain = `\nPermission Levels:\n- 0: 无权限 (no access)\n- 1: 基础使用 (basic)\n- 2: 授予/撤销其授予的 level 1\n- 3: 完全管理 (full)`;
  // 已移除的迁移/弃用说明文本，为保持文档简洁不再在描述中内嵌历史迁移信息。

  const config = new DocumentBuilder()
    .setTitle('Voidlord APIs')
    .setDescription(
      [
        'Voidlord 服务端 API 文档',
        '',
        '权限枚举 (Permissions):',
        permissionsList,
        levelExplain,
        '',
        '说明:',
        '- 系统媒体库仅禁止删除与名称/属性更新；允许添加书籍、嵌套子库与移除条目',
        '- 复制媒体库时自动处理命名冲突 ("(copy)", "(copy 2)" ...)',
        '- 标签体系支持自动去重与复用',
      ].join('\n'),
    )
    .setVersion('1.1.0')
    .addServer(host ? `http://${host}:${port}` : `http://localhost:${port}`)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: '在此输入 JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const paths = document.paths ?? {};
  const httpMethods = [
    'get',
    'put',
    'post',
    'delete',
    'patch',
    'options',
    'head',
    'trace',
  ] as const;

  for (const pathItem of Object.values(paths)) {
    if (!pathItem) continue;
    for (const method of httpMethods) {
      const candidate = (pathItem as Record<string, unknown>)[method];
      if (!candidate || typeof candidate !== 'object') continue;

      const op = candidate as { description?: string } & Record<
        string,
        unknown
      >;
      const xPerm = op['x-permission'];
      if (!xPerm || typeof xPerm !== 'object') continue;

      const { permission, minLevel } = xPerm as {
        permission?: string;
        minLevel?: number;
      };

      if (typeof permission !== 'string' || typeof minLevel !== 'number') {
        continue;
      }

      const line = `Requires permission: ${permission} (level >= ${minLevel})`;
      if (typeof op.description === 'string') {
        if (!op.description.includes('Requires permission:')) {
          op.description += `\n\n${line}`;
        }
      } else {
        op.description = line;
      }
    }
  }
  SwaggerModule.setup('api', app, document, {
    customSiteTitle: 'Voidlord API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      defaultModelsExpandDepth: 1, // 展开 DTO 模型，解决“模型消失”感知问题
    },
  });
};
