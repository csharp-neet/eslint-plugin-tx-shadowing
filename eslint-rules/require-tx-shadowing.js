/**
 * require-tx-shadowing.js
 *
 * ESLint カスタムルール。
 * 外側スコープに `tx` が存在する場合、.transaction() コールバックの
 * 第1引数も `tx` でなければエラーにし、--fix で自動リネームする。
 */

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: "suggestion",
    fixable: "code",
    messages: {
      mustBeTx:
        "シャドーイング必須: 外側の tx が見えたままです。コールバック引数を 'tx' にしてシャドーイングしてください。",
    },
  },

  create(context) {
    const sourceCode = context.getSourceCode();

    /** コールバック自身より外のスコープに `tx` があるか */
    function outerScopeHasTx(callbackNode) {
      // コールバック自身のスコープを取得し、その上位から探す
      let scope = sourceCode.getScope(callbackNode).upper;
      while (scope) {
        if (scope.variables.some((v) => v.name === "tx")) return true;
        scope = scope.upper;
      }
      return false;
    }

    /** `.transaction()` の第1引数として渡されているか */
    function isTransactionCallback(node) {
      const parent = node.parent;
      return (
        parent?.type === "CallExpression" &&
        parent.arguments[0] === node &&
        parent.callee?.type === "MemberExpression" &&
        parent.callee.property?.name === "transaction"
      );
    }

    function checkCallback(node) {
      if (!isTransactionCallback(node)) return;

      const param = node.params[0];
      if (!param || param.type !== "Identifier") return;
      if (param.name === "tx") return;
      if (!outerScopeHasTx(node)) return;

      // コールバックスコープで宣言された変数の全参照を取得
      const declaredVars = sourceCode.getScope(node).variables;
      const paramVar = declaredVars.find((v) => v.name === param.name);
      const refs = paramVar?.references ?? [];

      context.report({
        node: param,
        messageId: "mustBeTx",
        fix(fixer) {
          return [
            // 識別子名の部分だけ置換（TypeScript の型注釈 `: Tx` は残す）
            fixer.replaceTextRange(
              [param.range[0], param.range[0] + param.name.length],
              "tx"
            ),
            // 本体内の全使用箇所も置換
            ...refs
              .filter((r) => r.identifier !== param)
              .map((r) => fixer.replaceText(r.identifier, "tx")),
          ];
        },
      });
    }

    return {
      ArrowFunctionExpression: checkCallback,
      FunctionExpression: checkCallback,
    };
  },
};
