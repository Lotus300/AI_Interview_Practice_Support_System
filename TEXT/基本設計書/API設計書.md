# AI面接練習支援システム API設計書

## 1. 目的

本書は、AI面接練習支援システムのMVP実装に必要なAPIを定義する。

対象範囲は、認証、プロフィール管理、面接条件設定、面接セッション進行、音声認識、VOICEVOX音声生成、Geminiによる質問生成・回答分析、フィードバック生成、履歴管理、設定管理とする。

本書は以下の確定方針を反映する。

| 項目 | 方針 |
|---|---|
| APIサーバ | Cloud Run |
| 認証 | Google OAuth + Cookieセッション |
| 音声認識 | Google Cloud Speech-to-Text V2 |
| 音声認識モデル | Chirp 3 |
| LLM | Gemini API |
| LLM出力 | Gemini Structured Outputs |
| 音声出力 | VOICEVOX Engine API |
| フィードバック生成 | ジョブ型API |
| 音声データ保存 | 保存しない |
| ストリーミング | MVPでは使用しない |

## 2. 全体構成

```text
Browser
  -> Cloud Run Backend API
    -> Google Cloud Speech-to-Text V2
    -> Gemini API
    -> Cloud Run VOICEVOX Service
```

画面は自アプリのBackend APIのみを呼び出す。Google Cloud Speech-to-Text、Gemini、VOICEVOX Engine APIは、Backend APIの内部連携として扱う。

| 構成要素 | 役割 |
|---|---|
| Browser | 画面表示、録音、音声再生、API呼び出し |
| Cloud Run Backend API | 認証、セッション管理、業務API、外部API連携 |
| Google Cloud Speech-to-Text V2 | ユーザ回答音声の文字起こし |
| Gemini API | 質問生成、回答分析、矛盾検出、フィードバック生成 |
| Cloud Run VOICEVOX Service | AI面接官の質問音声生成 |
| DB | プロフィール、面接履歴、会話履歴、分析結果、フィードバックを保存 |

## 3. 共通仕様

### 3.1 ベースURL

```text
/api/v1
```

### 3.2 認証

MVPではGoogle OAuthでログインし、Backend APIがサーバ側セッションを作成する。ブラウザにはCookieセッションを付与する。

| 項目 | 内容 |
|---|---|
| Cookie名 | `interview_session` |
| Cookie属性 | `HttpOnly`, `Secure`, `SameSite=Lax` |
| API認証 | Cookieセッション |
| Bearer Token | ブラウザAPI呼び出しでは使用しない |
| CSRF対策 | 状態変更APIではCSRFトークンまたはOriginチェックを行う |

### 3.3 共通エラーレスポンス

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力内容を確認してください。",
    "details": [
      {
        "field": "jobRole",
        "message": "職種は必須です。"
      }
    ]
  }
}
```

### 3.4 共通エラーコード

| HTTP | code | 内容 |
|---|---|---|
| 400 | VALIDATION_ERROR | 入力値が不正 |
| 401 | UNAUTHORIZED | 未認証 |
| 403 | FORBIDDEN | 権限がない |
| 404 | NOT_FOUND | 対象データが存在しない |
| 409 | INVALID_STATE | 現在の状態では実行できない |
| 413 | PAYLOAD_TOO_LARGE | 音声ファイル等が大きすぎる |
| 429 | RATE_LIMITED | リクエスト過多 |
| 500 | INTERNAL_ERROR | サーバ内部エラー |
| 502 | EXTERNAL_SERVICE_ERROR | Speech-to-Text、Gemini、VOICEVOX等の外部連携エラー |

## 4. データ保存方針

| データ | 保存方針 |
|---|---|
| ユーザ回答音声 | 保存しない |
| Speech-to-Textへ送る音声 | リクエスト処理中のみ扱う |
| 音声認識結果テキスト | 保存する |
| VOICEVOX生成音声 | 原則保存しない |
| AI質問文 | 保存する |
| ユーザ回答テキスト | 保存する |
| 回答分析結果 | 保存する |
| フィードバック | 保存する |
| APIキー・認証情報 | Secret ManagerまたはCloud Run環境変数で管理する |

## 5. 状態定義

### 5.1 面接セッション状態

| 値 | 内容 |
|---|---|
| `draft` | 条件設定中 |
| `creating` | セッション作成中 |
| `initial_question_generating` | 初回質問生成中 |
| `question_presented` | 質問提示中 |
| `voice_outputting` | 音声出力中 |
| `waiting_answer` | 回答待機中 |
| `recording` | 回答取得中 |
| `speech_recognizing` | 音声認識中 |
| `answer_confirming` | 回答確認中 |
| `answer_analyzing` | 回答分析中 |
| `consistency_checking` | 整合性確認中 |
| `confirmation_question_generating` | 確認質問生成中 |
| `deep_dive_judging` | 深掘り判定中 |
| `deep_dive_question_generating` | 深掘り質問生成中 |
| `next_question_generating` | 次質問生成中 |
| `finish_confirming` | 終了確認中 |
| `finished` | 終了済み |

### 5.2 音声入力状態

| 値 | 内容 |
|---|---|
| `idle` | 待機中 |
| `permission_checking` | マイク権限確認中 |
| `recording` | 録音中 |
| `recognizing` | 音声認識中 |
| `recognized` | 認識完了 |
| `recognition_failed` | 認識失敗 |
| `text_inputting` | テキスト入力中 |
| `ready_to_submit` | 回答送信待ち |

### 5.3 AI応答状態

| 値 | 内容 |
|---|---|
| `idle` | 待機中 |
| `question_generating` | 質問生成中 |
| `question_generation_failed` | 質問生成失敗 |
| `voice_generating` | 音声生成中 |
| `voice_ready` | 音声再生待ち |
| `voice_playing` | 音声再生中 |
| `text_only` | テキスト継続 |
| `waiting_answer_notified` | 回答待機通知 |

### 5.4 フィードバック状態

| 値 | 内容 |
|---|---|
| `not_generated` | 未生成 |
| `generating` | 生成中 |
| `generation_failed` | 生成失敗 |
| `generated` | 生成完了 |
| `displaying` | 表示中 |
| `saving` | 保存中 |
| `save_failed` | 保存失敗 |
| `saved` | 保存済み |

### 5.5 ジョブ状態

| 値 | 内容 |
|---|---|
| `queued` | 待機中 |
| `running` | 実行中 |
| `completed` | 完了 |
| `failed` | 失敗 |
| `canceled` | キャンセル済み |

## 6. API一覧

| 区分 | Method | Path | 内容 |
|---|---|---|---|
| Auth | GET | `/auth/me` | ログインユーザ取得 |
| Auth | POST | `/auth/logout` | ログアウト |
| Account | DELETE | `/account` | 警告確認と「削除」の文字入力による二重確認後、アカウントと関連データを完全削除 |
| Profile | GET | `/profile` | プロフィール取得 |
| Profile | PUT | `/profile` | プロフィール保存・更新 |
| Interview | GET | `/interview-sessions` | 面接履歴一覧 |
| Interview | POST | `/interview-sessions` | 面接セッション作成 |
| Interview | GET | `/interview-sessions/{sessionId}` | 面接セッション取得 |
| Interview | DELETE | `/interview-sessions/{sessionId}` | 面接履歴削除 |
| Interview | POST | `/interview-sessions/{sessionId}/initial-question` | 初回質問生成 |
| Interview | POST | `/interview-sessions/{sessionId}/answers` | 回答送信・回答分析 |
| Interview | POST | `/interview-sessions/{sessionId}/next-question` | 次質問生成 |
| Interview | POST | `/interview-sessions/{sessionId}/finish` | 面接終了 |
| Feedback | POST | `/interview-sessions/{sessionId}/feedback` | フィードバック生成ジョブ開始 |
| Feedback | GET | `/interview-sessions/{sessionId}/feedback` | フィードバック取得 |
| Job | GET | `/jobs/{jobId}` | ジョブ状態取得 |
| Speech | POST | `/speech/recognize` | 音声認識 |
| Voice | POST | `/voice/synthesize` | VOICEVOX音声生成 |
| Settings | GET | `/settings` | 設定取得 |
| Settings | PUT | `/settings` | 設定更新 |

## 7. API詳細

### 7.1 ログインユーザ取得

```http
GET /api/v1/auth/me
```

#### Response

```json
{
  "user": {
    "id": "usr_001",
    "displayName": "田中 太郎",
    "email": "taro@example.com",
    "profileCompleted": true
  }
}
```

### 7.2 ログアウト

```http
POST /api/v1/auth/logout
```

#### Response

```json
{
  "loggedOut": true
}
```

### 7.3 プロフィール取得

```http
GET /api/v1/profile
```

#### Response

```json
{
  "profile": {
    "fullName": "田中 太郎",
    "educationType": "university",
    "schoolName": "東京サンプル大学",
    "department": "情報学部 情報工学科",
    "graduationStatus": "expected",
    "graduationYearMonth": "2027-03",
    "hasWorkExperience": true,
    "workExperiences": [
      {
        "companyName": "株式会社サンプル",
        "jobTitle": "開発職",
        "startYearMonth": "2024-04",
        "endYearMonth": null,
        "responsibilities": "社内ツール改善"
      }
    ],
    "desiredJobRole": "Webエンジニア",
    "selfPrSeed": "継続的に業務改善へ取り組んだ経験があります。"
  }
}
```

### 7.4 プロフィール保存・更新

```http
PUT /api/v1/profile
```

#### Request

```json
{
  "fullName": "田中 太郎",
  "educationType": "university",
  "schoolName": "東京サンプル大学",
  "department": "情報学部 情報工学科",
  "graduationStatus": "expected",
  "graduationYearMonth": "2027-03",
  "hasWorkExperience": true,
  "workExperiences": [
    {
      "companyName": "株式会社サンプル",
      "jobTitle": "開発職",
      "startYearMonth": "2024-04",
      "endYearMonth": null,
      "responsibilities": "社内ツール改善"
    }
  ],
  "desiredJobRole": "Webエンジニア",
  "selfPrSeed": "継続的に業務改善へ取り組んだ経験があります。"
}
```

#### Response

```json
{
  "profileCompleted": true,
  "profile": {
    "fullName": "田中 太郎",
    "updatedAt": "2026-07-10T12:00:00+09:00"
  }
}
```

### 7.5 面接セッション作成

```http
POST /api/v1/interview-sessions
```

#### Request

```json
{
  "interviewType": "career_change",
  "jobRole": "Webエンジニア",
  "industry": "IT",
  "companyName": null,
  "practiceTheme": "general",
  "questionCount": 10,
  "timeLimitMinutes": null
}
```

#### Response

```json
{
  "session": {
    "id": "ses_001",
    "status": "creating",
    "interviewType": "career_change",
    "jobRole": "Webエンジニア",
    "practiceTheme": "general",
    "questionCount": 10,
    "answeredCount": 0,
    "createdAt": "2026-07-10T12:05:00+09:00"
  }
}
```

### 7.6 面接セッション取得

```http
GET /api/v1/interview-sessions/{sessionId}
```

#### Response

```json
{
  "session": {
    "id": "ses_001",
    "status": "waiting_answer",
    "answeredCount": 2,
    "questionCount": 10,
    "currentQuestion": {
      "id": "q_003",
      "type": "normal",
      "text": "これまでの職務経験で、最も成果につながった取り組みを教えてください。",
      "voice": {
        "status": "voice_ready",
        "playbackUrl": "/api/v1/voice/playback/tmp_003"
      }
    },
    "conversation": [
      {
        "id": "utt_001",
        "speaker": "ai",
        "text": "お名前と現在のご経歴を教えてください。",
        "questionType": "fixed_confirmation",
        "createdAt": "2026-07-10T12:05:10+09:00"
      },
      {
        "id": "utt_002",
        "speaker": "user",
        "text": "田中太郎です。現在は株式会社サンプルで開発を担当しています。",
        "createdAt": "2026-07-10T12:05:45+09:00"
      }
    ]
  }
}
```

### 7.7 初回質問生成

```http
POST /api/v1/interview-sessions/{sessionId}/initial-question
```

#### 処理内容

Gemini APIを呼び出し、プロフィール情報に基づく定型確認質問を生成する。Geminiの出力はStructured Outputsで受け取る。

#### Response

```json
{
  "sessionStatus": "question_presented",
  "aiResponseStatus": "voice_generating",
  "question": {
    "id": "q_001",
    "type": "fixed_confirmation",
    "text": "まず、お名前と現在のご経歴を教えてください。"
  }
}
```

### 7.8 音声認識

```http
POST /api/v1/speech/recognize
Content-Type: multipart/form-data
```

#### 処理内容

Backend APIがGoogle Cloud Speech-to-Text V2を呼び出す。録音音声はリクエスト処理中のみ扱い、永続保存しない。

#### Request

| field | 内容 |
|---|---|
| `sessionId` | 面接セッションID |
| `questionId` | 回答対象の質問ID |
| `audio` | ユーザ回答音声 |

#### Response

```json
{
  "speechInputStatus": "recognized",
  "transcript": {
    "text": "私は前職で、問い合わせ対応の集計を自動化しました。",
    "confidence": 0.92
  }
}
```

#### 認識失敗時

```json
{
  "speechInputStatus": "recognition_failed",
  "recoveries": ["retry_recording", "text_input"]
}
```

### 7.9 回答送信・回答分析

```http
POST /api/v1/interview-sessions/{sessionId}/answers
```

#### 処理内容

回答テキストを保存し、Gemini APIで抽象度、具体性、登録プロフィールとの差異、深掘り要否を分析する。分析結果はStructured Outputsで受け取る。

#### Request

```json
{
  "questionId": "q_003",
  "answerText": "私は前職で、問い合わせ対応の集計を自動化しました。",
  "inputType": "speech",
  "speechTranscriptConfidence": 0.92
}
```

#### Response

```json
{
  "sessionStatus": "answer_analyzing",
  "answer": {
    "id": "ans_003",
    "text": "私は前職で、問い合わせ対応の集計を自動化しました。"
  },
  "analysis": {
    "status": "completed",
    "abstractness": "medium",
    "specificity": "low",
    "consistency": "needs_confirmation",
    "contradictionCandidates": [
      {
        "description": "登録職歴の期間と回答内の時期に差異の可能性があります。",
        "severity": "medium",
        "evidence": ["profile.workExperiences[0].startYearMonth", "utt_008"]
      }
    ],
    "deepDiveNeeded": true
  },
  "nextAction": "generate_confirmation_question"
}
```

### 7.10 次質問生成

```http
POST /api/v1/interview-sessions/{sessionId}/next-question
```

#### Request

```json
{
  "reason": "confirmation",
  "baseAnswerId": "ans_003"
}
```

| reason | 内容 |
|---|---|
| `normal` | 通常の次質問 |
| `deep_dive` | 深掘り質問 |
| `confirmation` | 矛盾候補・不明点の確認質問 |

#### Response

```json
{
  "sessionStatus": "question_presented",
  "question": {
    "id": "q_004",
    "type": "confirmation",
    "text": "登録情報では2024年4月から現職とありますが、この取り組みを始めた時期を確認してもよいですか。",
    "reason": "登録済み職歴と回答内容の時期に差異の可能性があるため"
  }
}
```

### 7.11 VOICEVOX音声生成

```http
POST /api/v1/voice/synthesize
```

#### 処理内容

Backend APIがVOICEVOX Engine APIを呼び出し、質問文から音声を生成する。画面側はVOICEVOX EngineのURLやポートを直接知らない。

内部処理は以下とする。

```text
1. POST /audio_query?text=<質問文>&speaker=<話者ID>
2. audio_query の結果に speedScale, volumeScale などを反映
3. POST /synthesis?speaker=<話者ID>
4. 生成されたWAV音声を画面へ返す
```

#### Request

```json
{
  "sessionId": "ses_001",
  "utteranceId": "utt_010",
  "text": "これまでの職務経験で、最も成果につながった取り組みを教えてください。",
  "speaker": "青山龍星",
  "speedScale": 1.0,
  "volumeScale": 1.0
}
```

#### Response

```json
{
  "aiResponseStatus": "voice_ready",
  "voice": {
    "id": "voice_010",
    "playbackUrl": "/api/v1/voice/playback/tmp_010",
    "durationMs": 4200
  }
}
```

VOICEVOX API呼び出しに失敗した場合は、`aiResponseStatus` を `text_only` とし、質問文のみで面接を継続できるようにする。

### 7.12 面接終了

```http
POST /api/v1/interview-sessions/{sessionId}/finish
```

#### Request

```json
{
  "finishReason": "user_requested"
}
```

#### Response

```json
{
  "session": {
    "id": "ses_001",
    "status": "finished",
    "answeredCount": 8,
    "finishedAt": "2026-07-10T12:25:00+09:00"
  },
  "feedbackStatus": "not_generated"
}
```

### 7.13 フィードバック生成ジョブ開始

```http
POST /api/v1/interview-sessions/{sessionId}/feedback
```

#### 処理内容

フィードバック生成はジョブ型APIとする。会話履歴、プロフィール、面接条件、回答分析結果をまとめてGemini APIに渡す。

#### Response

```json
{
  "job": {
    "id": "job_001",
    "type": "feedback_generation",
    "status": "queued",
    "sessionId": "ses_001",
    "progress": 0,
    "createdAt": "2026-07-10T12:25:10+09:00",
    "updatedAt": "2026-07-10T12:25:10+09:00"
  },
  "pollingUrl": "/api/v1/jobs/job_001"
}
```

### 7.14 ジョブ状態取得

```http
GET /api/v1/jobs/{jobId}
```

#### Response

```json
{
  "job": {
    "id": "job_001",
    "type": "feedback_generation",
    "status": "completed",
    "sessionId": "ses_001",
    "progress": 100,
    "resultRef": {
      "type": "feedback",
      "feedbackId": "fb_001",
      "sessionId": "ses_001"
    },
    "error": null,
    "createdAt": "2026-07-10T12:25:10+09:00",
    "updatedAt": "2026-07-10T12:25:50+09:00"
  }
}
```

### 7.15 フィードバック取得

```http
GET /api/v1/interview-sessions/{sessionId}/feedback
```

#### Response

```json
{
  "feedbackStatus": "displaying",
  "feedback": {
    "id": "fb_001",
    "overallSummary": "経験の流れは明確ですが、成果を数値で説明する余地があります。",
    "goodPoints": [
      {
        "title": "主体性が伝わる",
        "description": "業務改善に自分から取り組んだ点が明確です。",
        "evidenceUtteranceIds": ["utt_008"]
      }
    ],
    "abstractPoints": [
      {
        "targetText": "効率化できました",
        "reason": "どの程度効率化できたかが不明確です。",
        "improvementHint": "時間、件数、割合などで説明してください。"
      }
    ],
    "consistencyCandidates": [
      {
        "description": "登録職歴の在籍期間と回答内の時期に差異の可能性があります。",
        "severity": "medium",
        "evidenceUtteranceIds": ["utt_004", "utt_008"]
      }
    ],
    "deepDiveShortage": [
      "成果の数値",
      "自動化前後の比較",
      "自分が担当した範囲"
    ],
    "improvedAnswerExample": "問い合わせ対応の月次集計を自動化した結果、作業時間を月6時間削減しました。",
    "nextPracticeThemes": ["成果を数値で説明する", "職歴時期の一貫性を保つ"]
  }
}
```

### 7.16 面接履歴一覧

```http
GET /api/v1/interview-sessions?limit=20&cursor=<cursor>
```

#### Response

```json
{
  "items": [
    {
      "id": "ses_001",
      "interviewType": "career_change",
      "jobRole": "Webエンジニア",
      "practiceTheme": "general",
      "status": "finished",
      "answeredCount": 8,
      "summary": "成果説明の具体性に改善余地",
      "startedAt": "2026-07-10T12:05:00+09:00",
      "finishedAt": "2026-07-10T12:25:00+09:00"
    }
  ],
  "nextCursor": null
}
```

### 7.17 設定取得

```http
GET /api/v1/settings
```

#### Response

```json
{
  "settings": {
    "voicevoxSpeaker": "青山龍星",
    "speechRecognitionModel": "chirp_3",
    "questionGenerationModel": "gemini-2.5-flash",
    "answerAnalysisModel": "gemini-2.5-flash",
    "feedbackGenerationModel": "gemini-2.5-pro",
    "speedScale": 1.0,
    "volumeScale": 1.0,
    "saveAudio": false
  }
}
```

### 7.18 設定更新

```http
PUT /api/v1/settings
```

#### Request

```json
{
  "voicevoxSpeaker": "青山龍星",
  "speechRecognitionModel": "chirp_3",
  "questionGenerationModel": "gemini-2.5-flash",
  "answerAnalysisModel": "gemini-2.5-flash",
  "feedbackGenerationModel": "gemini-2.5-pro",
  "speedScale": 1.1,
  "volumeScale": 0.9,
  "saveAudio": false
}
```

#### バリデーション

| 項目 | 条件 |
|---|---|
| `speedScale` | 0.5以上2.0以下、0.1刻み |
| `volumeScale` | 0.5以上2.0以下、0.1刻み |
| `saveAudio` | MVPでは `false` 固定 |

#### Response

```json
{
  "settings": {
    "voicevoxSpeaker": "青山龍星",
    "speechRecognitionModel": "chirp_3",
    "questionGenerationModel": "gemini-2.5-flash",
    "answerAnalysisModel": "gemini-2.5-flash",
    "feedbackGenerationModel": "gemini-2.5-pro",
    "speedScale": 1.1,
    "volumeScale": 0.9,
    "saveAudio": false,
    "updatedAt": "2026-07-10T12:30:00+09:00"
  }
}
```

## 8. 画面とAPIの対応

| 画面 | 利用API |
|---|---|
| ログイン画面 | `GET /auth/me` |
| 初期プロフィール登録画面 | `GET /profile`, `PUT /profile` |
| ホーム画面 | `GET /auth/me`, `GET /interview-sessions` |
| 面接条件設定画面 | `GET /profile`, `POST /interview-sessions` |
| 面接実施画面 | `GET /interview-sessions/{id}`, `POST /initial-question`, `POST /speech/recognize`, `POST /voice/synthesize`, `POST /answers`, `POST /next-question`, `POST /finish` |
| フィードバック画面 | `POST /feedback`, `GET /jobs/{jobId}`, `GET /feedback` |
| 履歴画面 | `GET /interview-sessions`, `GET /interview-sessions/{id}`, `DELETE /interview-sessions/{id}` |
| 設定画面 | `GET /settings`, `PUT /settings` |

## 9. 外部API連携方針

### 9.1 Google Cloud Speech-to-Text V2

| 項目 | 方針 |
|---|---|
| 用途 | ユーザ回答音声の文字起こし |
| モデル | `chirp_3` |
| 呼び出し元 | Cloud Run Backend API |
| 音声保存 | 保存しない |
| 失敗時 | 再録音またはテキスト入力へ誘導 |

### 9.2 Gemini API

| 項目 | 方針 |
|---|---|
| 用途 | 質問生成、回答分析、矛盾検出、フィードバック生成 |
| 出力形式 | Structured Outputs |
| 質問生成 | `questionGenerationModel` |
| 回答分析 | `answerAnalysisModel` |
| フィードバック生成 | `feedbackGenerationModel` |
| 失敗時 | 再試行、固定質問で継続、またはジョブ失敗として扱う |

### 9.3 VOICEVOX Engine API

| 項目 | 方針 |
|---|---|
| 用途 | AI面接官の質問音声生成 |
| 配置 | 開発時はローカル、MVP配置時はCloud Run別サービス |
| 呼び出し元 | Cloud Run Backend API |
| 使用API | `/audio_query`, `/synthesis` |
| 音声保存 | 保存しない |
| 失敗時 | `text_only` として質問文のみ表示し、面接を継続 |

## 10. MVPで使用しないもの

| 項目 | 理由 |
|---|---|
| LLMストリーミング | 個人利用MVPでは通常レスポンスで十分 |
| 音声認識ストリーミング | 録音後の文字起こしで十分 |
| 音声データ永続保存 | プライバシーと実装簡素化を優先 |
| 全APIのジョブ化 | 実装が複雑になるため、フィードバック生成のみジョブ型にする |
| 管理者API | MVPでは利用者本人のみを想定 |

## 11. OpenAPI成果物

APIの機械可読な定義は以下のOpenAPI JSONに記載する。

```text
outputs/interview-practice-openapi.json
```

本API設計書とOpenAPI JSONの方針は一致させる。仕様変更時は両方を更新する。
