// Two-step login (TOTP authenticator app, Firebase Authentication) for the
// accounts that can change money, prices or who has access.
//
// Turned on in two places, so it can be rolled out gently:
//   NEXT_PUBLIC_REQUIRE_2FA=1  the app sends these roles to set it up
//                              (/security) until they have it
//   REQUIRE_2FA=1              the server refuses their requests unless the
//                              login used the second step
// Leave both off until the Firebase console steps are done (README).

const MFA_ROLES = ["admin", "manager", "accountant"];

/** True when this login session was completed with the second step. */
function usedSecondFactor(claims) {
  return Boolean(claims?.firebase?.sign_in_second_factor);
}

module.exports = { MFA_ROLES, usedSecondFactor };
