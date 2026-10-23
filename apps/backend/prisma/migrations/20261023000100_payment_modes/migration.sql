-- Preserve older payment records; their provider domain was not recorded.
ALTER TABLE "CheckoutIntent" ADD COLUMN "providerMode" VARCHAR(10) NOT NULL DEFAULT 'unknown';
ALTER TABLE "CheckoutIntent" ADD CONSTRAINT "CheckoutIntent_providerMode_valid"
  CHECK ("providerMode" IN ('unknown', 'test', 'live'));
ALTER TABLE "Payment" ADD COLUMN "providerMode" VARCHAR(10);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_providerMode_valid"
  CHECK ("providerMode" IS NULL OR "providerMode" IN ('test', 'live'));
