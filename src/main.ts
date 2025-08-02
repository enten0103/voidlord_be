import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { swaggerInit } from './init/swaggerInit';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  swaggerInit(app);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
