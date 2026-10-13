import { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

export function configureHttpSecurity(app: INestApplication) {
  const httpAdapter = app.getHttpAdapter();

  httpAdapter.getInstance().disable('x-powered-by');

  const isProduction = process.env.NODE_ENV === 'production';

  app.use(
    helmet({
      strictTransportSecurity: isProduction
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
          }
        : false,
    }),
  );
}
