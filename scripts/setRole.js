/**
 * One-off script to assign a role to a staff/agent Firebase Auth account.
 * Run with: node scripts/setRole.js <email> <role>
 * role must be one of: agent_car1, agent_car2, supervisor
 *
 * Automatically loads credentials from .env.local — no extra setup needed,
 * just run it from the project root (where .env.local lives).
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") });
const { adminAuth } = require("../lib/firebaseAdmin");

const VALID_ROLES = ["agent_car1", "agent_car2", "supervisor"];

async function main() {
  const [, , email, role] = process.argv;

  if (!email || !VALID_ROLES.includes(role)) {
    console.error(`Usage: node scripts/setRole.js <email> <role>`);
    console.error(`role must be one of: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }

  const user = await adminAuth.getUserByEmail(email);
  await adminAuth.setCustomUserClaims(user.uid, { role });
  console.log(`Set role "${role}" for ${email} (uid: ${user.uid})`);
  console.log("They must sign out and back in for the new role to take effect.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
