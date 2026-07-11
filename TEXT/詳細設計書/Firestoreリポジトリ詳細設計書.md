# AI面接練習支援システム Firestoreリポジトリ詳細設計書

## 1. 目的

本書は、バックエンド詳細設計をもとに、FirestoreへアクセスするRepository層の詳細を定義する。

RepositoryはFirestoreの読み書きに責務を限定し、業務判断、状態遷移、外部API呼び出しはService層で行う。

## 2. 共通方針

| 項目 | 方針 |
|---|---|
| DB | Firestore |
| SDK | Google Cloud Firestore SDK |
| 呼び出し元 | Service層 |
| 認可 | すべての取得・更新で `userId` を確認する |
| 論理削除 | `deletedAt` を使用する |
| 日時 | サーバ時刻を使用する |
| 音声データ | 保存しない |

## 3. 共通型

### 3.1 RepositoryContext

```ts
type RepositoryContext = {
  userId: string;
  requestId: string;
};
```

### 3.2 Timestamp

実装ではFirestore Timestampを使用する。ただしService層やDTOではISO文字列に変換して扱う。

```ts
type FirestoreTimestamp = FirebaseFirestore.Timestamp;
```

### 3.3 Pagination

```ts
type PaginationInput = {
  limit: number;
  cursor?: string;
};

type PaginationResult<T> = {
  items: T[];
  nextCursor: string | null;
};
```

## 4. コレクション定義

| Repository | Path |
|---|---|
| `UserRepository` | `users/{userId}` |
| `ProfileRepository` | `profiles/{userId}` |
| `SettingsRepository` | `settings/{userId}` |
| `AuthSessionRepository` | `authSessions/{sessionId}` |
| `InterviewSessionRepository` | `interviewSessions/{sessionId}` |
| `QuestionRepository` | `interviewSessions/{sessionId}/questions/{questionId}` |
| `AnswerRepository` | `interviewSessions/{sessionId}/answers/{answerId}` |
| `UtteranceRepository` | `interviewSessions/{sessionId}/utterances/{utteranceId}` |
| `FeedbackRepository` | `feedbacks/{feedbackId}` |
| `JobRepository` | `jobs/{jobId}` |

## 5. Repository一覧

## 5.1 UserRepository

### 5.1.1 Document

```ts
type UserDoc = {
  id: string;
  googleSub: string;
  email: string;
  displayName: string;
  profileCompleted: boolean;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
  lastLoginAt?: FirestoreTimestamp;
  deletedAt?: FirestoreTimestamp;
};
```

### 5.1.2 Methods

| メソッド | 引数 | 戻り値 | 内容 |
|---|---|---|---|
| `findById` | `userId` | `UserDoc \| null` | ユーザIDで取得 |
| `findByGoogleSub` | `googleSub` | `UserDoc \| null` | Google subで取得 |
| `create` | `UserDoc` | `UserDoc` | ユーザ作成 |
| `updateProfileCompleted` | `userId`, `completed` | `void` | 初期プロフィール完了状態を更新 |
| `updateLastLoginAt` | `userId` | `void` | 最終ログイン日時を更新 |

### 5.1.3 注意点

`googleSub` は一意である必要がある。Firestoreの一意制約は使えないため、OAuthコールバック処理では `findByGoogleSub` 後に作成する。

## 5.2 AuthSessionRepository

### 5.2.1 Document

```ts
type AuthSessionDoc = {
  id: string;
  sessionIdHash: string;
  userId: string;
  csrfTokenHash?: string;
  createdAt: FirestoreTimestamp;
  expiresAt: FirestoreTimestamp;
  revokedAt?: FirestoreTimestamp;
  userAgentHash?: string;
};
```

### 5.2.2 Methods

| メソッド | 引数 | 戻り値 | 内容 |
|---|---|---|---|
| `create` | `AuthSessionDoc` | `AuthSessionDoc` | セッション作成 |
| `findValidByHash` | `sessionIdHash`, `now` | `AuthSessionDoc \| null` | 有効なセッションを取得 |
| `revoke` | `sessionIdHash` | `void` | セッション失効 |
| `deleteExpired` | `now` | `number` | 期限切れセッション削除 |

### 5.2.3 findValidByHash条件

| 条件 | 内容 |
|---|---|
| `sessionIdHash == input` | Cookie値のハッシュと一致 |
| `expiresAt > now` | 有効期限内 |
| `revokedAt == null` | 失効していない |

Cookieの平文値は保存しない。

## 5.3 ProfileRepository

### 5.3.1 Document

```ts
type ProfileDoc = {
  userId: string;
  fullName: string;
  educationType: string;
  schoolName?: string;
  department?: string;
  graduationStatus?: string;
  graduationYearMonth?: string;
  hasWorkExperience: boolean;
  workExperiences?: WorkExperienceDoc[];
  desiredJobRole?: string;
  selfPrSeed?: string;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
};

type WorkExperienceDoc = {
  id: string;
  companyName: string;
  jobTitle: string;
  startYearMonth: string;
  endYearMonth?: string | null;
  responsibilities: string;
};
```

### 5.3.2 Methods

| メソッド | 引数 | 戻り値 | 内容 |
|---|---|---|---|
| `findByUserId` | `userId` | `ProfileDoc \| null` | プロフィール取得 |
| `upsert` | `userId`, `input` | `ProfileDoc` | プロフィール作成または更新 |

### 5.3.3 upsert方針

既存ドキュメントがない場合は `createdAt` と `updatedAt` を設定する。既存ドキュメントがある場合は `updatedAt` のみ更新する。

## 5.4 SettingsRepository

### 5.4.1 Document

```ts
type SettingsDoc = {
  userId: string;
  voicevoxSpeaker: string;
  speechRecognitionModel: string;
  questionGenerationModel: string;
  answerAnalysisModel: string;
  feedbackGenerationModel: string;
  speedScale: number;
  volumeScale: number;
  saveAudio: false;
  updatedAt: FirestoreTimestamp;
};
```

### 5.4.2 Methods

| メソッド | 引数 | 戻り値 | 内容 |
|---|---|---|---|
| `findByUserId` | `userId` | `SettingsDoc \| null` | 設定取得 |
| `upsert` | `userId`, `input` | `SettingsDoc` | 設定保存 |

`saveAudio` は常に `false` とする。

## 5.5 InterviewSessionRepository

### 5.5.1 Document

```ts
type InterviewSessionDoc = {
  id: string;
  userId: string;
  status: InterviewSessionStatus;
  interviewType: string;
  jobRole: string;
  industry?: string;
  companyName?: string | null;
  practiceTheme: string;
  questionCount: number;
  answeredCount: number;
  currentQuestionId?: string | null;
  feedbackStatus: FeedbackStatus;
  summary?: string;
  createdAt: FirestoreTimestamp;
  startedAt?: FirestoreTimestamp;
  finishedAt?: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
  deletedAt?: FirestoreTimestamp;
};
```

### 5.5.2 Methods

| メソッド | 引数 | 戻り値 | 内容 |
|---|---|---|---|
| `create` | `ctx`, `input` | `InterviewSessionDoc` | セッション作成 |
| `findByIdForUser` | `ctx`, `sessionId` | `InterviewSessionDoc \| null` | 所有者確認つき取得 |
| `listByUser` | `ctx`, `pagination` | `PaginationResult<InterviewSessionDoc>` | 履歴一覧 |
| `updateStatus` | `ctx`, `sessionId`, `status` | `void` | 状態更新 |
| `updateCurrentQuestion` | `ctx`, `sessionId`, `questionId`, `status` | `void` | 現在質問を更新 |
| `incrementAnsweredCount` | `ctx`, `sessionId` | `void` | 回答数を加算 |
| `finish` | `ctx`, `sessionId`, `finishedAt` | `InterviewSessionDoc` | 面接終了 |
| `updateFeedbackStatus` | `ctx`, `sessionId`, `status` | `void` | フィードバック状態更新 |
| `updateSummary` | `ctx`, `sessionId`, `summary` | `void` | 履歴要約更新 |
| `softDelete` | `ctx`, `sessionId` | `void` | 論理削除 |

### 5.5.3 listByUser条件

| 条件 | 内容 |
|---|---|
| `userId == ctx.userId` | 自分の履歴のみ |
| `deletedAt == null` | 削除済みを除外 |
| order | `createdAt desc` |

## 5.6 QuestionRepository

### 5.6.1 Document

```ts
type QuestionDoc = {
  id: string;
  sessionId: string;
  userId: string;
  type: "fixed_confirmation" | "normal" | "deep_dive" | "confirmation";
  text: string;
  reason?: string;
  baseAnswerId?: string | null;
  aiResponseStatus: AiResponseStatus;
  voiceStatus?: string;
  voiceId?: string | null;
  createdAt: FirestoreTimestamp;
};
```

### 5.6.2 Methods

| メソッド | 引数 | 戻り値 | 内容 |
|---|---|---|---|
| `create` | `ctx`, `sessionId`, `input` | `QuestionDoc` | 質問作成 |
| `findById` | `ctx`, `sessionId`, `questionId` | `QuestionDoc \| null` | 質問取得 |
| `listBySession` | `ctx`, `sessionId` | `QuestionDoc[]` | セッション内質問一覧 |
| `updateVoiceStatus` | `ctx`, `sessionId`, `questionId`, `voiceStatus` | `void` | 音声状態更新 |

## 5.7 AnswerRepository

### 5.7.1 Document

```ts
type AnswerDoc = {
  id: string;
  sessionId: string;
  userId: string;
  questionId: string;
  text: string;
  inputType: "speech" | "text";
  speechTranscriptConfidence?: number | null;
  analysis?: AnswerAnalysisDoc;
  nextAction?: string;
  createdAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
};
```

### 5.7.2 Methods

| メソッド | 引数 | 戻り値 | 内容 |
|---|---|---|---|
| `create` | `ctx`, `sessionId`, `input` | `AnswerDoc` | 回答作成 |
| `findById` | `ctx`, `sessionId`, `answerId` | `AnswerDoc \| null` | 回答取得 |
| `listBySession` | `ctx`, `sessionId` | `AnswerDoc[]` | 回答一覧 |
| `updateAnalysis` | `ctx`, `sessionId`, `answerId`, `analysis`, `nextAction` | `void` | 分析結果更新 |

## 5.8 UtteranceRepository

### 5.8.1 Document

```ts
type UtteranceDoc = {
  id: string;
  sessionId: string;
  userId: string;
  speaker: "ai" | "user";
  text: string;
  questionId?: string | null;
  answerId?: string | null;
  questionType?: string | null;
  sequenceNo: number;
  createdAt: FirestoreTimestamp;
};
```

### 5.8.2 Methods

| メソッド | 引数 | 戻り値 | 内容 |
|---|---|---|---|
| `create` | `ctx`, `sessionId`, `input` | `UtteranceDoc` | 発話作成 |
| `listBySessionOrdered` | `ctx`, `sessionId` | `UtteranceDoc[]` | 会話履歴を順序つき取得 |
| `getNextSequenceNo` | `ctx`, `sessionId` | `number` | 次の発話順を取得 |

### 5.8.3 sequenceNo方針

`sequenceNo` は会話履歴の表示順に使う。発話追加時に現在最大値 + 1 を採番する。競合が問題になる場合は、発話追加処理をトランザクション内で行う。

## 5.9 FeedbackRepository

### 5.9.1 Document

```ts
type FeedbackDoc = {
  id: string;
  sessionId: string;
  userId: string;
  status: FeedbackStatus;
  overallSummary: string;
  goodPoints?: FeedbackGoodPointDoc[];
  abstractPoints?: FeedbackAbstractPointDoc[];
  consistencyCandidates?: FeedbackConsistencyCandidateDoc[];
  deepDiveShortage?: string[];
  improvedAnswerExample?: string;
  nextPracticeThemes?: string[];
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
};
```

### 5.9.2 Methods

| メソッド | 引数 | 戻り値 | 内容 |
|---|---|---|---|
| `create` | `ctx`, `input` | `FeedbackDoc` | フィードバック作成 |
| `findBySessionId` | `ctx`, `sessionId` | `FeedbackDoc \| null` | セッションIDで取得 |
| `updateStatus` | `ctx`, `feedbackId`, `status` | `void` | 状態更新 |

## 5.10 JobRepository

### 5.10.1 Document

```ts
type JobDoc = {
  id: string;
  type: "feedback_generation";
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  sessionId: string;
  userId: string;
  progress: number;
  resultRef?: {
    type: "feedback";
    feedbackId: string;
    sessionId: string;
  } | null;
  error?: {
    code: string;
    message: string;
  } | null;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
  startedAt?: FirestoreTimestamp;
  completedAt?: FirestoreTimestamp;
};
```

### 5.10.2 Methods

| メソッド | 引数 | 戻り値 | 内容 |
|---|---|---|---|
| `create` | `ctx`, `type`, `sessionId` | `JobDoc` | ジョブ作成 |
| `findByIdForUser` | `ctx`, `jobId` | `JobDoc \| null` | 所有者確認つき取得 |
| `markRunning` | `jobId` | `void` | 実行中に更新 |
| `updateProgress` | `jobId`, `progress` | `void` | 進捗更新 |
| `markCompleted` | `jobId`, `resultRef` | `void` | 完了に更新 |
| `markFailed` | `jobId`, `error` | `void` | 失敗に更新 |

## 6. トランザクション設計

### 6.1 質問生成トランザクション

| 順序 | 処理 |
|---|---|
| 1 | `interviewSessions/{sessionId}` を取得 |
| 2 | `userId` と状態を検証 |
| 3 | `questions/{questionId}` を作成 |
| 4 | `utterances/{utteranceId}` を作成 |
| 5 | `interviewSessions.currentQuestionId` を更新 |
| 6 | `interviewSessions.status` を更新 |

### 6.2 回答保存トランザクション

| 順序 | 処理 |
|---|---|
| 1 | `interviewSessions/{sessionId}` を取得 |
| 2 | `userId` と状態を検証 |
| 3 | `answers/{answerId}` を作成 |
| 4 | `utterances/{utteranceId}` を作成 |
| 5 | `interviewSessions.answeredCount` を加算 |
| 6 | `interviewSessions.status` を更新 |

Gemini分析は外部API呼び出しのため、トランザクション内では実行しない。回答保存後に分析し、`answers.analysis` を更新する。

### 6.3 フィードバック完了トランザクション

| 順序 | 処理 |
|---|---|
| 1 | `jobs/{jobId}` を取得 |
| 2 | `feedbacks/{feedbackId}` を作成 |
| 3 | `jobs.status` を `completed` に更新 |
| 4 | `jobs.resultRef` を更新 |
| 5 | `interviewSessions.feedbackStatus` を `generated` に更新 |
| 6 | `interviewSessions.summary` を更新 |

## 7. インデックス

| 用途 | コレクション | 条件 | 並び順 |
|---|---|---|---|
| 面接履歴一覧 | `interviewSessions` | `userId == ?`, `deletedAt == null` | `createdAt desc` |
| 状態別面接検索 | `interviewSessions` | `userId == ?`, `status == ?` | `updatedAt desc` |
| ジョブ一覧 | `jobs` | `userId == ?`, `status == ?` | `createdAt desc` |
| フィードバック取得 | `feedbacks` | `userId == ?`, `sessionId == ?` | `createdAt desc` |
| セッション期限管理 | `authSessions` | `expiresAt < now` | `expiresAt asc` |

## 8. 例外設計

| 状況 | 例外 |
|---|---|
| ドキュメントが存在しない | `NOT_FOUND` |
| `userId` が一致しない | `FORBIDDEN` |
| 削除済みデータへアクセス | `NOT_FOUND` |
| 状態が不正 | `INVALID_STATE` |
| Firestore更新失敗 | `INTERNAL_ERROR` |

RepositoryではFirestore固有エラーをそのまま上位へ漏らさず、共通エラーに変換する。

## 9. テスト設計

| Repository | テスト観点 |
|---|---|
| UserRepository | Google sub検索、作成、最終ログイン更新 |
| AuthSessionRepository | 有効、期限切れ、失効済み |
| ProfileRepository | 新規作成、更新 |
| SettingsRepository | 初期値、更新、saveAudio false固定 |
| InterviewSessionRepository | 作成、所有者確認、一覧、論理削除 |
| QuestionRepository | 作成、一覧、音声状態更新 |
| AnswerRepository | 作成、分析更新 |
| UtteranceRepository | sequenceNo順取得 |
| FeedbackRepository | 作成、セッション取得 |
| JobRepository | 作成、進捗更新、完了、失敗 |

Firestore Emulatorを用いたIntegration Testを基本とする。

## 10. 実装順序

1. Firestore接続モジュールを作成
2. 共通Repositoryヘルパーを作成
3. UserRepositoryとAuthSessionRepositoryを実装
4. ProfileRepositoryとSettingsRepositoryを実装
5. InterviewSessionRepositoryを実装
6. Question, Answer, Utterance Repositoryを実装
7. JobRepositoryとFeedbackRepositoryを実装
8. トランザクション処理を追加
9. Firestore Emulatorテストを追加
