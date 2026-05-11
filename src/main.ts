import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';
import { ensureCategoryUploadDir } from './product-category/multer.config';
import { ensureProductUploadDir } from './product/multer.config';
import { ensureProfileUploadDir } from './user/multer.config';

async function bootstrap() {
  ensureProductUploadDir();
  ensureCategoryUploadDir();
  ensureProfileUploadDir();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Desent Club Backend API')
    .setDescription('Authentication and eCommerce backend APIs')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
