# AI Interview Practice Support System

AI面接練習支援システムのMVP実装用リポジトリです。

## 現在の実装範囲

- Node.js標準HTTPによるBackend MVP
- Google OAuth相当のデモログイン
- Cookieセッション
- Firestore永続化（Cloud Run本番）とインメモリRepository（ローカル・テスト）
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

Google OAuthの本番設定は [docs/GOOGLE_OAUTH_SETUP.md](docs/GOOGLE_OAUTH_SETUP.md) を参照してください。

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

保存先は既定でインメモリです。本番相当のFirestoreを使う場合は、Application Default Credentialsを設定した上で次を指定します。

```env
DATA_STORE=firestore
GCP_PROJECT_ID=your-project-id
FIRESTORE_DATABASE_ID=(default)
```

Cloud Runでは鍵ファイルを配置せず、実行サービスアカウントのADCを使用します。実行サービスアカウントには `roles/datastore.user` が必要です。

初回起動後は「Googleでログイン」を押してください。OAuth環境変数が未設定の場合は、自動的にローカルデモログインとして動作します。

`NODE_ENV=production` ではデモログインを無効化します。Google OAuthが未設定の場合、ログインAPIは503を返し、複数利用者が同じデモユーザーのデータを共有することを防ぎます。

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

Cloud RunではBackendがFrontendも配信するため、サービスURLだけで画面とAPIの両方へアクセスできる。同一オリジン構成ではFrontendのAPI接続先は `/api/v1` になる。ローカルでFrontendをポート5173から起動した場合だけ、従来どおり `http://localhost:8080/api/v1` を使用する。

## 注意

Google OAuthは環境変数設定時に実接続します。Gemini、Speech-to-Text、VOICEVOXはクライアント本接続前のローカルモックで、未接続時も一連の画面確認を継続できます。`DATA_STORE=memory` の場合だけ、Backendを再起動するとデータが消去されます。
