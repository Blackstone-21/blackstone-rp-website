const { handlePortal } = require('../server/portal-core.cjs');

module.exports = async function handler(req, res) {
  return handlePortal(req, res, process.env);
};
