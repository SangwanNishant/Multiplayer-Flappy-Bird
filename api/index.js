// Vercel serverless entry point.
// All non-static requests come through here thanks to the rewrites in
// vercel.json. The Express app exported from ../server.js handles them.
module.exports = require("../server.js");
