export function paymentConfiguration(
  env?: Record<string, string | undefined>,
): {
  mode: string;
  valid: boolean;
  enabled: boolean;
  walletEnabled: boolean;
  callbackUrl: string;
};
