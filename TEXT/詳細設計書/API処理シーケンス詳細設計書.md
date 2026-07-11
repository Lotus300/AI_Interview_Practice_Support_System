# AI面接練習支援システム API処理シーケンス詳細設計書

## 1. 目的

本書は、APIごとの処理シーケンスを詳細化し、Controller、Service、Repository、外部APIの呼び出し順、状態更新、失敗時分岐を定義する。

## 2. 共通処理

### 2.1 認証つきAPI共通シーケンス

```mermaid
sequenceDiagram
  participant Browser
  participant API as Cloud Run Backend API
  participant Auth as AuthMiddleware
  participant Repo as AuthSessionRepository

  Browser->>API: API request with interview_session Cookie
  API->>Auth: verify session
  Auth->>Repo: findValidByHash(sessionIdHash)
  Repo-->>Auth: authSession
  Auth-->>API: RequestContext(userId)
  API-->>Browser: API response
```

認証失敗時は `401 UNAUTHORIZED` を返す。

### 2.2 状態チェック共通シーケンス

```text
1. sessionIdを受け取る
2. InterviewSessionRepository.findByIdForUser(ctx, sessionId)
3. sessionが存在しなければ404
4. session.userIdがctx.userIdと異なれば403
5. 許可状態でなければ409 INVALID_STATE
6. 業務処理を続行
```

## 3. プロフィール保存

対象API:

```http
PUT /api/v1/profile
```

```mermaid
sequenceDiagram
  participant Browser
  participant Controller as ProfileController
  participant Service as ProfileService
  participant ProfileRepo as ProfileRepository
  participant UserRepo as UserRepository

  Browser->>Controller: PUT /profile
  Controller->>Controller: validate body
  Controller->>Service: upsertProfile(ctx, input)
  Service->>ProfileRepo: upsert(userId, input)
  ProfileRepo-->>Service: profile
  Service->>UserRepo: updateProfileCompleted(userId, true)
  Service-->>Controller: profileCompleted, profile
  Controller-->>Browser: 200 OK
```

失敗時:

| 条件 | 応答 |
|---|---|
| 必須項目不足 | `400 VALIDATION_ERROR` |
| 未ログイン | `401 UNAUTHORIZED` |
| Firestore更新失敗 | `500 INTERNAL_ERROR` |

## 4. 面接セッション作成

対象API:

```http
POST /api/v1/interview-sessions
```

```mermaid
sequenceDiagram
  participant Browser
  participant Controller as InterviewController
  participant Service as InterviewSessionService
  participant ProfileRepo as ProfileRepository
  participant SessionRepo as InterviewSessionRepository

  Browser->>Controller: POST /interview-sessions
  Controller->>Controller: validate body
  Controller->>Service: createSession(ctx, input)
  Service->>ProfileRepo: findByUserId(userId)
  ProfileRepo-->>Service: profile
  Service->>SessionRepo: create(ctx, input)
  SessionRepo-->>Service: session(status=creating)
  Service-->>Controller: session
  Controller-->>Browser: 200 OK
```

処理ルール:

| 項目 | 内容 |
|---|---|
| プロフィール未登録 | 面接開始不可 |
| 初期状態 | `creating` |
| `answeredCount` | 0 |
| `feedbackStatus` | `not_generated` |

## 5. 初回質問生成

対象API:

```http
POST /api/v1/interview-sessions/{sessionId}/initial-question
```

```mermaid
sequenceDiagram
  participant Browser
  participant Controller as InterviewController
  participant Service as QuestionService
  participant SessionRepo as InterviewSessionRepository
  participant ProfileRepo as ProfileRepository
  participant Gemini as GeminiClient
  participant QuestionRepo as QuestionRepository
  participant UtteranceRepo as UtteranceRepository

  Browser->>Controller: POST /initial-question
  Controller->>Service: generateInitialQuestion(ctx, sessionId)
  Service->>SessionRepo: findByIdForUser(ctx, sessionId)
  SessionRepo-->>Service: session
  Service->>Service: validate status
  Service->>ProfileRepo: findByUserId(userId)
  ProfileRepo-->>Service: profile
  Service->>Gemini: generateInitialQuestion(profile, session)
  Gemini-->>Service: question output
  Service->>QuestionRepo: create(question)
  Service->>UtteranceRepo: create(ai utterance)
  Service->>SessionRepo: updateCurrentQuestion(questionId, question_presented)
  Service-->>Controller: question
  Controller-->>Browser: 200 OK
```

状態更新:

| 更新対象 | 更新内容 |
|---|---|
| `interviewSessions.status` | `question_presented` |
| `interviewSessions.currentQuestionId` | 作成した質問ID |
| `questions.aiResponseStatus` | `question_generating` から `voice_generating` |
| `utterances` | AI発話を追加 |

Gemini失敗時:

| 条件 | 応答 |
|---|---|
| Gemini API失敗 | `502 EXTERNAL_SERVICE_ERROR` |
| 代替案 | 固定質問で継続可能にする |

## 6. VOICEVOX音声生成

対象API:

```http
POST /api/v1/voice/synthesize
```

```mermaid
sequenceDiagram
  participant Browser
  participant Controller as VoiceController
  participant Service as VoiceService
  participant SettingsRepo as SettingsRepository
  participant Voicevox as VoicevoxClient

  Browser->>Controller: POST /voice/synthesize
  Controller->>Controller: validate body
  Controller->>Service: synthesize(ctx, input)
  Service->>SettingsRepo: findByUserId(userId)
  SettingsRepo-->>Service: settings
  Service->>Voicevox: createAudioQuery(text, speakerId)
  Voicevox-->>Service: audioQuery
  Service->>Service: apply speedScale, volumeScale
  Service->>Voicevox: synthesize(audioQuery, speakerId)
  Voicevox-->>Service: wav audio
  Service-->>Controller: voice_ready
  Controller-->>Browser: 200 OK
```

VOICEVOX失敗時:

```json
{
  "aiResponseStatus": "text_only",
  "voice": null
}
```

失敗しても面接は継続する。

## 7. 音声認識

対象API:

```http
POST /api/v1/speech/recognize
```

```mermaid
sequenceDiagram
  participant Browser
  participant Controller as SpeechController
  participant Service as SpeechService
  participant SessionRepo as InterviewSessionRepository
  participant Speech as SpeechToTextClient

  Browser->>Controller: POST /speech/recognize multipart
  Controller->>Controller: validate sessionId, questionId, audio
  Controller->>Service: recognize(ctx, input)
  Service->>SessionRepo: findByIdForUser(ctx, sessionId)
  SessionRepo-->>Service: session
  Service->>Service: validate status
  Service->>Speech: recognize(audio, chirp_3)
  Speech-->>Service: transcript
  Service->>Service: discard audio
  Service-->>Controller: recognized result
  Controller-->>Browser: 200 OK
```

DB保存:

| データ | 保存 |
|---|---|
| 音声バイナリ | しない |
| 文字起こしテキスト | このAPIでは保存しない |
| 信頼度 | このAPIでは保存しない |

文字起こし結果は、ユーザ確認後 `POST /answers` で保存する。

認識失敗時:

```json
{
  "speechInputStatus": "recognition_failed",
  "recoveries": ["retry_recording", "text_input"]
}
```

## 8. 回答送信・回答分析

対象API:

```http
POST /api/v1/interview-sessions/{sessionId}/answers
```

```mermaid
sequenceDiagram
  participant Browser
  participant Controller as InterviewController
  participant Service as AnswerService
  participant SessionRepo as InterviewSessionRepository
  participant AnswerRepo as AnswerRepository
  participant UtteranceRepo as UtteranceRepository
  participant Gemini as GeminiClient

  Browser->>Controller: POST /answers
  Controller->>Controller: validate body
  Controller->>Service: submitAnswer(ctx, sessionId, input)
  Service->>SessionRepo: findByIdForUser(ctx, sessionId)
  SessionRepo-->>Service: session
  Service->>Service: validate status
  Service->>AnswerRepo: create(answer)
  Service->>UtteranceRepo: create(user utterance)
  Service->>SessionRepo: incrementAnsweredCount()
  Service->>Gemini: analyzeAnswer(context)
  Gemini-->>Service: analysis
  Service->>AnswerRepo: updateAnalysis(answerId, analysis, nextAction)
  Service->>SessionRepo: updateStatus(next status)
  Service-->>Controller: answer, analysis, nextAction
  Controller-->>Browser: 200 OK
```

状態更新:

| `nextAction` | 次状態 |
|---|---|
| `generate_confirmation_question` | `confirmation_question_generating` |
| `generate_deep_dive_question` | `deep_dive_question_generating` |
| `generate_normal_question` | `next_question_generating` |
| `finish_interview` | `finish_confirming` |

Gemini分析失敗時:

| 方針 | 内容 |
|---|---|
| 回答保存 | 維持する |
| 分析結果 | `analysis.status=failed` として保存可能 |
| 画面 | 再分析または固定質問で継続 |

## 9. 次質問生成

対象API:

```http
POST /api/v1/interview-sessions/{sessionId}/next-question
```

```mermaid
sequenceDiagram
  participant Browser
  participant Controller as InterviewController
  participant Service as QuestionService
  participant SessionRepo as InterviewSessionRepository
  participant ProfileRepo as ProfileRepository
  participant AnswerRepo as AnswerRepository
  participant UtteranceRepo as UtteranceRepository
  participant Gemini as GeminiClient
  participant QuestionRepo as QuestionRepository

  Browser->>Controller: POST /next-question
  Controller->>Controller: validate reason
  Controller->>Service: generateNextQuestion(ctx, sessionId, input)
  Service->>SessionRepo: findByIdForUser(ctx, sessionId)
  Service->>ProfileRepo: findByUserId(userId)
  Service->>AnswerRepo: listBySession(ctx, sessionId)
  Service->>UtteranceRepo: listBySessionOrdered(ctx, sessionId)
  Service->>Gemini: generateNextQuestion(context)
  Gemini-->>Service: question output
  Service->>QuestionRepo: create(question)
  Service->>UtteranceRepo: create(ai utterance)
  Service->>SessionRepo: updateCurrentQuestion(questionId, question_presented)
  Service-->>Controller: question
  Controller-->>Browser: 200 OK
```

`reason` ごとのGemini入力:

| reason | 追加コンテキスト |
|---|---|
| `normal` | 面接条件、既出質問、回答履歴 |
| `deep_dive` | 対象回答、抽象度、具体性不足 |
| `confirmation` | 矛盾候補、プロフィール該当箇所、対象回答 |

## 10. 面接終了

対象API:

```http
POST /api/v1/interview-sessions/{sessionId}/finish
```

```mermaid
sequenceDiagram
  participant Browser
  participant Controller as InterviewController
  participant Service as InterviewSessionService
  participant SessionRepo as InterviewSessionRepository

  Browser->>Controller: POST /finish
  Controller->>Service: finishSession(ctx, sessionId, input)
  Service->>SessionRepo: findByIdForUser(ctx, sessionId)
  Service->>Service: validate status
  Service->>SessionRepo: finish(ctx, sessionId, now)
  SessionRepo-->>Service: session
  Service-->>Controller: session, feedbackStatus
  Controller-->>Browser: 200 OK
```

終了後の状態:

| 項目 | 値 |
|---|---|
| `interviewSessions.status` | `finished` |
| `feedbackStatus` | `not_generated` |
| `finishedAt` | 現在日時 |

## 11. フィードバック生成ジョブ開始

対象API:

```http
POST /api/v1/interview-sessions/{sessionId}/feedback
```

```mermaid
sequenceDiagram
  participant Browser
  participant Controller as FeedbackController
  participant Service as FeedbackService
  participant SessionRepo as InterviewSessionRepository
  participant JobRepo as JobRepository

  Browser->>Controller: POST /feedback
  Controller->>Service: startFeedbackJob(ctx, sessionId)
  Service->>SessionRepo: findByIdForUser(ctx, sessionId)
  Service->>Service: validate status=finished
  Service->>JobRepo: create(feedback_generation)
  Service->>SessionRepo: updateFeedbackStatus(generating)
  Service-->>Controller: job, pollingUrl
  Controller-->>Browser: 202 Accepted
```

作成時のジョブ:

| 項目 | 値 |
|---|---|
| `type` | `feedback_generation` |
| `status` | `queued` |
| `progress` | 0 |

## 12. フィードバック生成ジョブ実行

```mermaid
sequenceDiagram
  participant Job as FeedbackGenerationJob
  participant JobRepo as JobRepository
  participant SessionRepo as InterviewSessionRepository
  participant ProfileRepo as ProfileRepository
  participant AnswerRepo as AnswerRepository
  participant UtteranceRepo as UtteranceRepository
  participant Gemini as GeminiClient
  participant FeedbackRepo as FeedbackRepository

  Job->>JobRepo: markRunning(jobId)
  Job->>SessionRepo: findByIdForUser(ctx, sessionId)
  Job->>ProfileRepo: findByUserId(userId)
  Job->>AnswerRepo: listBySession(ctx, sessionId)
  Job->>UtteranceRepo: listBySessionOrdered(ctx, sessionId)
  Job->>Gemini: generateFeedback(context)
  Gemini-->>Job: feedback output
  Job->>FeedbackRepo: create(feedback)
  Job->>JobRepo: markCompleted(resultRef)
  Job->>SessionRepo: updateFeedbackStatus(generated)
```

失敗時:

| 処理 | 内容 |
|---|---|
| `jobs.status` | `failed` |
| `jobs.error` | エラーコードとメッセージ |
| `interviewSessions.feedbackStatus` | `generation_failed` |
| 復旧 | ユーザが再生成可能 |

## 13. ジョブ状態取得

対象API:

```http
GET /api/v1/jobs/{jobId}
```

```mermaid
sequenceDiagram
  participant Browser
  participant Controller as JobController
  participant Service as JobService
  participant JobRepo as JobRepository

  Browser->>Controller: GET /jobs/{jobId}
  Controller->>Service: getJob(ctx, jobId)
  Service->>JobRepo: findByIdForUser(ctx, jobId)
  JobRepo-->>Service: job
  Service-->>Controller: job
  Controller-->>Browser: 200 OK
```

認可:

| 条件 | 応答 |
|---|---|
| jobが存在しない | `404 NOT_FOUND` |
| job.userIdが異なる | `403 FORBIDDEN` |

## 14. フィードバック取得

対象API:

```http
GET /api/v1/interview-sessions/{sessionId}/feedback
```

```mermaid
sequenceDiagram
  participant Browser
  participant Controller as FeedbackController
  participant Service as FeedbackService
  participant SessionRepo as InterviewSessionRepository
  participant FeedbackRepo as FeedbackRepository

  Browser->>Controller: GET /feedback
  Controller->>Service: getFeedback(ctx, sessionId)
  Service->>SessionRepo: findByIdForUser(ctx, sessionId)
  Service->>FeedbackRepo: findBySessionId(ctx, sessionId)
  FeedbackRepo-->>Service: feedback
  Service-->>Controller: feedback
  Controller-->>Browser: 200 OK
```

未生成時:

```json
{
  "feedbackStatus": "not_generated",
  "feedback": null
}
```

## 15. 設定更新

対象API:

```http
PUT /api/v1/settings
```

```mermaid
sequenceDiagram
  participant Browser
  participant Controller as SettingsController
  participant Service as SettingsService
  participant Repo as SettingsRepository

  Browser->>Controller: PUT /settings
  Controller->>Controller: validate body
  Controller->>Service: updateSettings(ctx, input)
  Service->>Service: force saveAudio=false
  Service->>Repo: upsert(userId, settings)
  Repo-->>Service: settings
  Service-->>Controller: settings
  Controller-->>Browser: 200 OK
```

バリデーション:

| 項目 | 条件 |
|---|---|
| `speedScale` | 0.5以上2.0以下、0.1刻み |
| `volumeScale` | 0.5以上2.0以下、0.1刻み |
| `saveAudio` | `false` 固定 |

## 16. 失敗時の共通復旧方針

| 失敗箇所 | 復旧 |
|---|---|
| Speech-to-Text | 再録音、テキスト入力 |
| Gemini質問生成 | 再試行、固定質問で継続 |
| Gemini回答分析 | 回答保存済みとして再分析、または次質問へ進む |
| VOICEVOX | 質問文のみ表示して継続 |
| Feedback job | 再生成 |
| Firestore | リトライせずエラー表示。二重登録に注意 |

## 17. 実装優先度

| 優先度 | API |
|---|---|
| 1 | `GET /auth/me`, `PUT /profile`, `GET /settings`, `PUT /settings` |
| 2 | `POST /interview-sessions`, `GET /interview-sessions/{id}` |
| 3 | `POST /initial-question`, `POST /next-question` |
| 4 | `POST /speech/recognize`, `POST /answers` |
| 5 | `POST /voice/synthesize` |
| 6 | `POST /finish`, `POST /feedback`, `GET /jobs/{jobId}`, `GET /feedback` |
