import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './bootstrap/app.module';
import { configureApplication } from './bootstrap/configure-application';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureApplication(app);
  app.enableShutdownHooks();
  const config = app.get(ConfigService);
  await app.listen(
    config.get<number>('PORT') ?? 3000,
    config.get<string>('HOST') ?? '127.0.0.1',
  );
}
bootstrap().catch(() => {
  console.error(
    'OneCall backend could not start. Check configuration and database/Redis availability.',
  );
  process.exit(1);
});
