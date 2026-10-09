// Which supervisor decides an agent's request. An agent's account names
// his supervisor (supervisorUid claim, set by the admin). Requests made
// before that existed (no supervisorUid) can be decided by any supervisor,
// as before.
function isMineToDecide(request, decoded) {
  if (!request || request.requestedBy === decoded.uid) return false;
  if (decoded.role === "manager") return true;
  if (!decoded.salesSupervisor) return false;
  return !request.supervisorUid || request.supervisorUid === decoded.uid;
}
module.exports = { isMineToDecide };
