import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').required(),

  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  HOST: Joi.string().default('127.0.0.1'),
  TRUST_PROXY: Joi.number().integer().min(0).max(5).default(0),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  PAYMENT_WEBHOOK_SECRET: Joi.string().min(32).required(),
  THROTTLE_GLOBAL_LIMIT: Joi.number().integer().positive().default(100),
  THROTTLE_GLOBAL_TTL_MS: Joi.number().integer().positive().default(60000),
  THROTTLE_KEY_PREFIX: Joi.string().default('onecall:throttle:'),
  CORS_ORIGINS: Joi.string().allow('').default(''),
  AUTH_DELIVERY_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .allow(''),
  AUTH_DELIVERY_SECRET: Joi.string().min(32).allow(''),
  PAYSTACK_SECRET_KEY: Joi.string()
    .pattern(/^sk_(test|live)_[A-Za-z0-9]+$/)
    .allow('')
    .default(''),
  ONECALL_WALLET_ENABLED: Joi.string().valid('true', 'false').default('false'),

  ONECALL_UPLOADS_ENABLED: Joi.string().valid('true', 'false').default('true'),
  ONECALL_UPLOAD_ROOT: Joi.string().allow(''),

  APP_NAME: Joi.string().required(),

  APP_VERSION: Joi.string().required(),

  API_PREFIX: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/)
    .required(),

  DATABASE_URL: Joi.string().required(),
  DATABASE_POOL_SIZE: Joi.number().integer().min(1).max(50).default(10),

  JWT_SECRET: Joi.string().min(32).required(),

  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
});
