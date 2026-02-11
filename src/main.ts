import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './modules/app/app.module';
import { swaggerInit } from './utils/swaggerInit';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 注意：同源策略是浏览器行为，服务端无法“取消”。
  // 这里提供一个“临时放开跨域”的开关，用于本地开发调试。

  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['*'],
    exposedHeaders: ['*'],
  });

  // 启用全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  swaggerInit(app);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
