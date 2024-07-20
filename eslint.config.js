const { resolve } = require("node:path");
const globals = require("globals");

const prettier = require("eslint-config-prettier");
const turbo = require("eslint-plugin-turbo");
const onlyWarn = require("eslint-plugin-only-warn");
const js = require("@eslint/js");

const project = resolve(process.cwd(), "tsconfig.json");

/** @type {import("eslint").Linter.Config} */
module.exports = [
  js.configs.recommended,
  prettier,
  {
    ...turbo.configs.recommended,
    plugins: {
      turbo,
    },
  },
  {
    plugins: {
      onlyWarn,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        require: true,
        module: true,
      },
    },
    settings: {
      "import/resolver": {
        typescript: {
          project,
        },
      },
    },
    ignores: [
      // Ignore dotfiles
      ".*.js",
      "node_modules/",
      "dist/",
      "eslint.config.js",
    ],
  },
];
