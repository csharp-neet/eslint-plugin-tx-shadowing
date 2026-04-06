import tsParser from "@typescript-eslint/parser";
import requireTxShadowing from "./eslint-rules/require-tx-shadowing.js";

export default [
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      local: { rules: { "require-tx-shadowing": requireTxShadowing } },
    },
    rules: {
      "local/require-tx-shadowing": "error",
    },
  },
];
