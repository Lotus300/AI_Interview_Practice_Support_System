# AI Interview Practice Support System

AI面接練習支援システムのMVP実装用リポジトリです。

## 現在の実装範囲

- Node.js標準HTTPによるBackend MVP
- Google OAuth相当のデモログイン
- Cookieセッション
- プロフィール登録
- 面接セッション作成
- 初回質問生成、回答分析、次質問生成のローカルモック
- Speech-to-Text相当のローカルモック
- VOICEVOX未接続時の `text_only` 継続
- フィードバックジョブの即時実行モック
- プロフィール、ホーム、条件設定、面接、終了確認、フィードバック、履歴、音声設定のFrontend MVP
- MediaRecorderによる録音とSpeech-to-Textモックへの送信（音声は保存しない）
- 入力検証、所有者チェック、履歴削除、ジョブ状態取得
- Backend主要ロジックの自動テスト

## コード構成

Backendは責務ごとに分割しています。

```text
apps/backend/src/
  core/                  エラー、入力検証、ルーティング、所有者確認
  features/auth/         認証・セッション
  features/profile/      プロフィール
  features/settings/     音声設定
  features/interviews/   面接セッション、質問、回答分析
  features/media/        音声認識・音声合成のモック境界
  features/feedback/     フィードバックとジョブ
  server.mjs             HTTPサーバーの組み立てと起動
```

Frontendも状態、通信、録音、画面表示を分離しています。

```text
apps/frontend/src/
  core/                  APIクライアント、状態、HTML共通部品
  features/recording.mjs 録音ライフサイクル
  views/                 機能別画面
  app.mjs                イベントとユースケースの統合
```

外部APIは機能境界を維持しつつ、ローカルモックで動作します。本接続時は `features/media` などの実装を差し替え、画面や面接フローを変更せず接続できます。

外部API本接続は、詳細設計に従って各Client層へ追加します。

## 起動

Codex内蔵Nodeを使う場合:

```powershell
& "C:\Users\renya\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" apps/backend/src/server.mjs
```

別ターミナルで:

```powershell
& "C:\Users\renya\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" apps/frontend/server.mjs
```

通常のNode.jsがPATHにある場合:

```bash
npm run dev:backend
npm run dev:frontend
```

初回起動後は「Googleでログイン」を押してください。OAuth環境変数が未設定の場合は、自動的にローカルデモログインとして動作します。

## テスト

```bash
npm test
```

構文チェック:

```bash
npm run check
```

ローカルMVPでは、ログイン、プロフィール登録、面接条件設定、回答、深掘り質問、終了、フィードバック、履歴確認まで一通り操作できます。

## URL

- Backend: `http://localhost:8080/api/v1/health`
- Frontend: `http://localhost:5173`

## 注意

Google OAuthは環境変数設定時に実接続します。Firestore、Gemini、Speech-to-Text、VOICEVOXはクライアント本接続前のローカルモックで、未接続時も一連の画面確認を継続できます。メモリ保存のため、Backendを再起動するとローカルデータは消去されます。
