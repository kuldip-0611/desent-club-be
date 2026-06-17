import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';
import { ensureProfileUploadDir } from './user/multer.config';
import { CancellationReasonService } from './cancellation-reason/cancellation-reason.service';

async function bootstrap() {
  // Profile photos still stored locally (avatars are small & user-scoped)
  ensureProfileUploadDir();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Keep raw body buffer for Razorpay + Shiprocket webhook HMAC verification
    rawBody: true,
  });
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
    .setTitle('Disent Club Backend API')
    .setDescription('Authentication and eCommerce backend APIs')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);
  // Seed default cancellation reasons if none exist
  const cancelReasonService = app.get(CancellationReasonService);
  await cancelReasonService.seed();

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
