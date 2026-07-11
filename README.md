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
- TypeScript SPA想定の静的Frontend MVP

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

## URL

- Backend: `http://localhost:8080/api/v1/health`
- Frontend: `http://localhost:5173`

## 注意

現在はMVP土台であり、Google OAuth、Firestore、Gemini、Speech-to-Text、VOICEVOXは本接続前のモックです。
