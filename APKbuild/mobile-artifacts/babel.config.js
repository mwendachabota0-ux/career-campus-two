const path = require("path");

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins: [path.resolve(__dirname, "scripts/babel-plugin-strip-webpackignore-imports.js")],
    env: {
      production: {
        plugins: [path.resolve(__dirname, "scripts/babel-plugin-strip-webpackignore-imports.js")],
      },
    },
  };
};
