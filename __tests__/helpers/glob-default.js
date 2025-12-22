// Minimal CommonJS-friendly glob stub for Jest coverage checks.
function globStub() {
  return [];
}
globStub.sync = () => [];

module.exports = globStub;
module.exports.default = globStub;
