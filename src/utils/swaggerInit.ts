import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PERMISSIONS } from '../modules/auth/permissions.constants';

export const swaggerInit = (app: INestApplication) => {
  const host = process.env.PUBLIC_HOST_IP;
  const port = process.env.PORT || '3000';
  const permissionsList = PERMISSIONS.map((p) => `- ${p}`).join('\n');
  const levelExplain = `\nPermission Levels:\n- 0: 无权限 (no access)\n- 1: 基础使用 (basic)\n- 2: 授予/撤销其授予的 level 1\n- 3: 完全管理 (full)`;
  const config = new DocumentBuilder()
    .setTitle('Voidlord APIs')
    .setDescription(
      'The Voidlord API description\n\nPermissions:\n' +
        permissionsList +
        levelExplain,
    )
    .setVersion('1.0')
    .addServer(host ? `http://${host}:${port}` : `http://localhost:${port}`)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth', // This name here is important for matching up with @ApiBearerAuth() in your controller!
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  for (const path of Object.keys(document.paths)) {
    const item: any = (document.paths as any)[path];
    for (const method of Object.keys(item)) {
      const op = item[method];
      if (op && op['x-permission']) {
        const { permission, minLevel } = op['x-permission'];
        const line = `Requires permission: ${permission} (level >= ${minLevel})`;
        if (op.description) {
          if (!op.description.includes('Requires permission:')) {
            op.description += `\n\n${line}`;
          }
        } else {
          op.description = line;
        }
      }
    }
  }
  SwaggerModule.setup('api', app, document);
};
