# 実装アーキテクチャ

## 方針

画面・業務フロー・認証・入力検証・ローカル保存・テストを実装し、Firestore、Gemini、Speech-to-Text、VOICEVOXの本接続は差し替え可能な境界として残す。

## Backend

| ディレクトリ | 責務 |
|---|---|
| `src/core` | HTTPに依存しないエラー、検証、ルーティング、リソース所有者確認 |
| `src/features/auth` | ログイン、Cookieセッション、OAuthコールバック |
| `src/features/profile` | プロフィール取得・更新 |
| `src/features/settings` | 話者、話速、音量設定 |
| `src/features/interviews` | セッション、質問、回答、ローカル回答分析 |
| `src/features/media` | 音声認識・音声合成のローカルモック境界 |
| `src/features/feedback` | フィードバック生成とジョブ状態 |
| `src/store.mjs` | MVP用インメモリデータストア |
| `src/server.mjs` | 各機能の組み立て、認証・CORS共通処理、サーバー起動 |

各機能の `routes.mjs` はHTTP入出力を、`service.mjs` は業務ロジックを担当する。外部API本接続時は、ルートや画面ではなくサービスまたはクライアント実装を差し替える。

## Frontend

| ディレクトリ | 責務 |
|---|---|
| `src/core/api.mjs` | HTTP通信と面接APIファサード |
| `src/core/state.mjs` | アプリケーション状態と状態初期化 |
| `src/core/html.mjs` | エスケープ、フォーム、表示共通関数 |
| `src/features/recording.mjs` | MediaRecorderの開始・停止・リソース解放 |
| `src/views` | ログイン、プロフィール、条件設定、面接、履歴、設定画面 |
| `src/app.mjs` | イベントをユースケースへ接続するコントローラー |

## 最適化内容

- ルート探索、エラー応答、入力検証、所有者確認を共通化
- API呼び出しを `interviewApi` に集約し、URLとHTTPメソッドの重複を削減
- フィードバックジョブの多重生成を防止
- 質問数到達時に不要な次質問を生成しない
- 録音終了・ログアウト時にMediaStreamを確実に解放
- 初期データ取得と履歴詳細取得を並列化
- HTML出力を共通エスケープ関数に統一
- HTTPサーバー生成と起動を分離し、プロセスなしで統合テスト可能に変更

## 外部接続時の差し替え先

| 外部サービス | 現在 | 本接続時 |
|---|---|---|
| Firestore | `store.mjs` のインメモリMap | Repository実装へ差し替え |
| Gemini | `features/interviews/service.mjs` と `features/feedback/service.mjs` のローカルロジック | Gemini Clientを注入 |
| Speech-to-Text | `features/media/routes.mjs` の固定文字起こし | Speech Clientを呼ぶServiceへ差し替え |
| VOICEVOX | `text_only` 応答 | Voicevox Clientを呼ぶServiceへ差し替え |

この境界により、外部API接続後も画面・認証・状態遷移・履歴・テスト構造を維持できる。
