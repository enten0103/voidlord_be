import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export const swaggerInit = (app: INestApplication) => {
    const config = new DocumentBuilder()
        .setTitle('Voidlord APIs')
        .setDescription('The Voidlord API description')
        .setVersion('1.0')
        .build();

    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, documentFactory);
}