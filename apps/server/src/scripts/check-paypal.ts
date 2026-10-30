// Run with: npm run check:paypal
// Confirms the sandbox keys in .env work and shows which account the app belongs to.
import { getAppToken, paypal, PayPalError } from "../paypal/client.js";

interface MerchantInfo {
  payer_id?: string;
  emails?: { value: string; primary?: boolean }[];
  address?: { country?: string };
}

try {
  const token = await getAppToken();
  console.log("OK  Sandbox keys work.");

  const scopes = token.scope.split(" ");
  const login = scopes.includes("openid");
  console.log(
    login
      ? "OK  Log in with PayPal looks enabled on this app."
      : "--  Log in with PayPal not detected on this app yet. Check it's ticked and saved; we'll also confirm with a real login in Phase 1.",
  );

  try {
    const me = await paypal<MerchantInfo>("/v1/identity/oauth2/userinfo?schema=paypalv1.1");
    const email = me.emails?.find((e) => e.primary)?.value ?? me.emails?.[0]?.value ?? "unknown";
    const country = me.address?.country ?? "unknown";
    console.log(`OK  App belongs to sandbox business account ${email} (country: ${country}).`);
    if (country !== "US" && country !== "unknown") {
      console.log("!!  This should be a US business account. Create the app under a US business sandbox account instead.");
    }
  } catch {
    console.log("--  Couldn't read the business account details (not a problem for now).");
  }
} catch (err) {
  if (err instanceof PayPalError && err.status === 401) {
    console.error("XX  PayPal rejected the keys. Re-copy the Client ID and Secret from the Doorman app (Sandbox, not Live) into .env.");
  } else {
    console.error("XX  Couldn't reach PayPal:", err instanceof Error ? err.message : err);
  }
  process.exit(1);
}
