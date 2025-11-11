import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PERMISSIONS } from '../modules/auth/permissions.constants';

export const swaggerInit = (app: INestApplication) => {
  const host = process.env.PUBLIC_HOST_IP;
  const port = process.env.PORT || '3000';
  const permissionsList = PERMISSIONS.map((p) => `- ${p}`).join('\n');
  const levelExplain = `\nPermission Levels:\n- 0: 无权限 (no access)\n- 1: 基础使用 (basic)\n- 2: 授予/撤销其授予的 level 1\n- 3: 完全管理 (full)`;
  const deprecationNotes = [
    'Deprecated Modules:',
    '- FavoriteList/FavoriteListItem 已移除，使用 MediaLibraries 替代',
    '- reading-records 已移除，使用系统媒体库 “系统阅读记录” 替代',
  ].join('\n');

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
        deprecationNotes,
        '',
        '说明:',
        '- 系统媒体库不可删除/添加普通书籍（未来可扩展进度统计）',
        '- 复制媒体库时自动处理命名冲突',
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
      defaultModelsExpandDepth: -1,
    },
  });
};
