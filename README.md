# eslint-plugin-tx-shadowing

トランザクション管理システムにおいて、ネストしたトランザクションのコールバック引数が外側の `tx` を**必ずシャドーイングすること**を強制する ESLint カスタムルール。

---

## 背景・検証目的

### 解決したい問題

トランザクションを受け取る関数の中で、さらにネストしたトランザクションを作成する場合、内側のコールバックで外側の `tx` に誤ってアクセスできてしまう。

```ts
async function updateUser(tx: Tx) {
    await tx.user.update({ id: 1 });

    await db.transaction(async (innerTx: Tx) => {
        await innerTx.post.update({ id: 1 });
        await tx.user.update({ id: 2 }); // ← 外側の tx に誤ってアクセスできてしまう
    });
}
```

コールバック引数を意図的に `tx` と命名することで、外側の `tx` がシャドーイングされ、内側からアクセスできなくなる。

```ts
async function updateUser(tx: Tx) {
    await db.transaction(async (tx: Tx) => { // ← 外側の tx がシャドーイングされる
        await tx.post.update({ id: 1 });
        // ここから外側の tx には触れない
    });
}
```

このシャドーイングを**強制するルール**を lint として定義し、違反時に `--fix` で自動修正することを目標とした。

---

## Biome で対応できなかった理由

### 試みたこと

Biome（v2.4）には GritQL というパターンマッチング言語でカスタム lint ルールを書けるプラグイン機能がある。以下のような GritQL ルールで検出まではできた。

```gritql
engine biome(1.0)
language js(typescript, jsx)

or {
    `$_.transaction(async ($param) => $body, $...)`,
    `$_.transaction(($param) => $body, $...)`
} as $txCall where {
    $param <: contains JsIdentifierBinding() as $name,
    $name <: not r"tx",
    or {
        $txCall <: within `async function $_($outerParam, $...) { $_ }` where {
            $outerParam <: contains JsIdentifierBinding() as $outerName,
            $outerName <: r"tx"
        },
        // ...
    },
    register_diagnostic(
        span = $name,
        message = "シャドーイング必須"
    )
}
```

`JsIdentifierBinding()`・`contains`・`within` など AST ノードを直接操作でき、外側スコープへの到達も可能だった。

### `--write` に対応できない構造的理由

Biome v2.4 のプラグインシステムは **診断のみ** に対応しており、自動修正（コードアクション）を返す仕組みがない。

```rust
// biome_analyze/src/analyzer_plugin.rs（v2.4 main ブランチ）

pub trait AnalyzerPlugin: Debug + Send + Sync {
    fn evaluate(&self, node: AnySyntaxNode, path: Arc<Utf8PathBuf>) -> Vec<RuleDiagnostic>;
    //                                                                 ^^^^^^^^^^^^^^^^^^^
    //                                                                 診断のみ。fix を返す手段がない。
}
```

```rust
// biome_analyze/src/signals.rs（v2.4 main ブランチ）

impl<L: Language> AnalyzerSignal<L> for PluginSignal<L> {
    fn actions(&self, _filter: ActionFilter) -> AnalyzerActionIter<L> {
        AnalyzerActionIter::new(vec![])  // 常に空。--write で適用されない。
    }
}
```

一方、Biome に組み込まれている標準ルール（`useFlatMap` など）は `Rule` トレイトを実装しており、`fn action()` で `BatchMutation`（AST 書き換え命令）を返せる。これが `--write` の実体。プラグインからはこのトレイトを利用できない。

### GritQL の `=>` リライト演算子について

GritQL 言語仕様には `=>` によるリライト演算子があり、パターンにマッチした箇所を置換する構文が存在する。Biome v2.4 では `=>` を含む GritQL はコンパイルできるが、プラグインランナーがリライト結果を無視する実装になっており、ファイルへの反映は行われない。

v2.5 開発ブランチ（`next`）では対応が実装済みで、以下の構文が使えるようになる予定：

```gritql
`$call` where {
    register_diagnostic(
        span = $call,
        message = "...",
        fix_kind = "safe"    // --write で適用
    ),
    $call => `置換後のコード`
}
```

ただし、GritQL の `=>` はマッチしたノードの**文字列置換**であり、パラメーター宣言の変更にとどまる。本体内の全参照を追跡するスコープ解析は行われないため、変数の全使用箇所のリネームには対応できない。

### まとめ

| 機能 | Biome v2.4 GritQL | Biome v2.5 GritQL | ESLint カスタムルール |
|------|:-----------------:|:-----------------:|:--------------------:|
| パターン検出（AST） | ✅ | ✅ | ✅ |
| 外側スコープの検出 | ✅（`within`） | ✅ | ✅ |
| `--write` 対応 | ❌ | ✅（部分的） | ✅ |
| 全参照のリネーム | ❌ | ❌（文字列置換のみ） | ✅（スコープ解析） |

---

## 解決策：ESLint カスタムルール

ESLint のカスタムルールは `fix()` 関数を持てるため、`eslint --fix` で診断と修正を一括実行できる。スコープ解析（`sourceCode.getScope()`）と参照追跡（`variable.references`）を使って、パラメーター宣言と本体内の全使用箇所を正しくリネームする。

```
npm run lint   # 検出
npm run write  # 自動修正（eslint --fix）
```

---

## ファイル構成

```
eslint-rules/
└── require-tx-shadowing.js   # カスタムルール本体
eslint.config.js              # ESLint 設定（このルールのみ有効化）
src/
└── examples.ts               # 動作確認用サンプル（OK / NG パターン）
tsconfig.json
package.json
```
