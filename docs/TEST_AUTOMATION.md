# テスト自動化ツール

## 目的

`TEXT/テスト設計書.md` のテストID・優先度と、`tests/pr-history.json` のPR履歴を回帰テストへ結び付け、構文検証、Nodeテスト、重要契約、本番スモークテストを一括実行する。

通常の自動テストではGoogle Cloud、Gemini、Speech-to-Text、VOICEVOXを直接呼ばないため、外部API費用は発生しない。本番スモークも読み取り専用エンドポイントと未認証応答だけを確認する。

## ローカル実行

全ローカル検証を実行する。

```bash
pnpm test:automation
```

デプロイ済み環境のスモークテストも含める。

```bash
node scripts/test-automation.mjs \
  --target https://interview-backend-lz44oy5pza-an.a.run.app
```

本番スモークだけを実行する。

```bash
node scripts/test-automation.mjs \
  --skip-tests \
  --skip-syntax \
  --target https://interview-backend-lz44oy5pza-an.a.run.app
```

環境変数 `TEST_TARGET_URL` でも対象URLを指定できる。

## 自動検証内容

| 検証 | 内容 |
|---|---|
| 設計トレーサビリティ | テスト設計書からテストIDとP0/P1/P2を抽出する |
| PRトレーサビリティ | PR #1〜#31が回帰グループとテストファイルへ関連付いていることを確認する |
| 構文検証 | `apps`、`packages`、`scripts` 配下の全 `.mjs` を `node --check` する |
| Nodeテスト | `apps/backend/test/*.test.mjs` を実行する |
| 重要回帰契約 | モバイルログイン、全体二重送信、質問生成排他、回答冪等性、履歴ページングを確認する |
| 本番スモーク | health 200、未認証401、API 404 JSON、Frontend 200を確認する |

## レポート

実行後、次を生成する。シークレット、Cookie、個人情報は記録しない。

- `test-results/test-report.json`
- `test-results/test-report.md`

GitHub Actionsでは `automated-test-report` Artifactとして保存される。

## GitHub Actions

`.github/workflows/test-automation.yml` は次のタイミングで実行する。

- `main` 向けPull Request
- `main` へのpush
- 手動実行

手動実行時に `target_url` を入力すると、本番スモークも同時に実行する。

## PR履歴の更新

新しい機能PRをマージした場合は、次の2ファイルを更新する。

1. `tests/pr-history.json` にPR番号とタイトルを追加する
2. `test-automation.config.json` の適切な回帰グループへPR番号とテストファイルを追加する

未分類の変更を残さず、設計上の受入条件、実装変更、回帰テストの対応関係を維持する。
