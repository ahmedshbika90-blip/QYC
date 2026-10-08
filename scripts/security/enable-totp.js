/**
 * Turns on authenticator-app (TOTP) two-step login for the Firebase project
 * — the one setting the Firebase console doesn't show a switch for.
 *
 *   node scripts/security/enable-totp.js                               → shows the current setting
 *   node scripts/security/enable-totp.js --run --confirm=<project-id>  → turns TOTP on
 *
 * Needs "Firebase Authentication with Identity Platform" first (console →
 * Authentication → Settings → upgrade). Turning it on only makes two-step
 * login AVAILABLE; it's required for admin / manager / accountant only once
 * REQUIRE_2FA=1 and NEXT_PUBLIC_REQUIRE_2FA=1 are set in Vercel.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env.local") });

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v === undefined ? true : v]; }));

async function main() {
  const { adminAuth } = require("../../lib/firebaseAdmin");
  const project = process.env.FIREBASE_PROJECT_ID;
  const pcm = adminAuth.projectConfigManager();
  const current = await pcm.getProjectConfig();
  const totp = (current.multiFactorConfig?.providerConfigs || []).find((p) => p.totpProviderConfig);
  console.log(`\nFirebase project: ${project}`);
  console.log(`Authenticator-app two-step login: ${totp?.state === "ENABLED" ? "ON" : "off"}\n`);
  if (!args.run) return console.log("Dry run. Add --run --confirm=" + project + " to turn it on.\n");
  if (args.confirm !== project) {
    console.error(`Refusing: add --confirm=${project}`);
    process.exit(1);
  }
  await pcm.updateProjectConfig({
    multiFactorConfig: {
      state: "ENABLED",
      factorIds: current.multiFactorConfig?.factorIds || [],
      // adjacentIntervals: accept codes up to 5 × 30 s early/late (phone clocks drift)
      providerConfigs: [{ state: "ENABLED", totpProviderConfig: { adjacentIntervals: 5 } }],
    },
  });
  console.log("Done — staff can now turn it on from «التحقق بخطوتين».\n");
}

main().catch((e) => {
  console.error(e.message.includes("CONFIGURATION_NOT_FOUND") || e.message.includes("Identity Platform") ? "Upgrade to Firebase Authentication with Identity Platform first (console → Authentication → Settings)." : e);
  process.exit(1);
});
