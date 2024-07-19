const base = require("@repo/eslint-config/library");

module.exports = [
  ...base,
  {
    ignores: ["dist/*"],
  },
];
