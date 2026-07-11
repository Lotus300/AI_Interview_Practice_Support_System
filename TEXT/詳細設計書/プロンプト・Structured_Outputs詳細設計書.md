# AI面接練習支援システム Geminiプロンプト・Structured Outputs詳細設計書

## 1. 目的

本書は、Gemini APIを用いた質問生成、回答分析、次質問生成、フィードバック生成の詳細設計を定義する。

対象は、プロンプト構成、入力コンテキスト、Structured OutputsのJSON Schema、出力項目、失敗時の扱いである。

## 2. 基本方針

| 項目 | 方針 |
|---|---|
| LLM | Gemini API |
| 出力形式 | Structured Outputs |
| 入力 | プロフィール、面接条件、会話履歴、回答分析結果 |
| 出力言語 | 日本語 |
| 役割 | AI面接官、面接評価者 |
| 禁止事項 | 事実として断定できない矛盾を断定しない |
| 音声 | Geminiでは扱わない。音声認識後のテキストのみ扱う |

## 3. Gemini利用箇所

| 用途 | 呼び出し元 | モデル設定 | 出力 |
|---|---|---|---|
| 初回質問生成 | `QuestionService.generateInitialQuestion` | `questionGenerationModel` | `InitialQuestionOutput` |
| 回答分析 | `AnswerService.submitAnswer` | `answerAnalysisModel` | `AnswerAnalysisOutput` |
| 次質問生成 | `QuestionService.generateNextQuestion` | `questionGenerationModel` | `NextQuestionOutput` |
| フィードバック生成 | `FeedbackGenerationJob` | `feedbackGenerationModel` | `FeedbackOutput` |

## 4. 共通プロンプト方針

### 4.1 共通システム指示

```text
あなたは面接練習支援システムのAI面接官兼評価者です。
ユーザの面接練習を支援するため、自然で簡潔な日本語を使用してください。
回答内容を評価する場合は、根拠となる発話または登録情報を参照してください。
矛盾の可能性がある場合は、断定せず「確認候補」として扱ってください。
個人情報を不要に出力しないでください。
出力は指定されたJSON Schemaに必ず従ってください。
```

### 4.2 共通入力コンテキスト

```ts
type GeminiBaseContext = {
  profile: {
    fullName?: string;
    educationType?: string;
    schoolName?: string;
    department?: string;
    graduationStatus?: string;
    graduationYearMonth?: string;
    workExperiences?: Array<{
      companyName: string;
      jobTitle: string;
      startYearMonth: string;
      endYearMonth?: string | null;
      responsibilities?: string;
    }>;
    desiredJobRole?: string;
    selfPrSeed?: string;
  };
  interviewCondition: {
    interviewType: string;
    jobRole: string;
    industry?: string;
    companyName?: string | null;
    practiceTheme: string;
    questionCount: number;
  };
  conversation: Array<{
    id: string;
    speaker: "ai" | "user";
    text: string;
    questionType?: string | null;
    sequenceNo: number;
  }>;
};
```

### 4.3 出力共通ルール

| ルール | 内容 |
|---|---|
| JSONのみ | 自由文の前置きやMarkdownを出力しない |
| 不明点 | `unknown` や空配列を使い、推測で補わない |
| 矛盾 | 断定ではなく候補として出す |
| 質問文 | 1問だけ生成する |
| 質問文の長さ | 原則120文字以内 |
| 面接官口調 | 丁寧語 |

## 5. 初回質問生成

### 5.1 用途

面接開始時に、氏名、学歴、職歴などの定型確認質問を生成する。

### 5.2 入力

```ts
type InitialQuestionInput = GeminiBaseContext & {
  requiredConfirmationTargets: Array<"name" | "education" | "work_experience">;
};
```

### 5.3 プロンプトテンプレート

```text
以下のプロフィールと面接条件をもとに、面接冒頭の確認質問を1つ生成してください。

目的:
- 氏名、学歴、職歴の確認を自然に行う
- ユーザが答えやすい質問にする
- 1問に複数要素を詰め込みすぎない

プロフィール:
{{profile}}

面接条件:
{{interviewCondition}}

既存会話:
{{conversation}}
```

### 5.4 出力Schema

```ts
type InitialQuestionOutput = {
  questionType: "fixed_confirmation";
  questionText: string;
  confirmationTargets: Array<"name" | "education" | "work_experience">;
  reason: string;
};
```

### 5.5 出力例

```json
{
  "questionType": "fixed_confirmation",
  "questionText": "まず、お名前と現在のご経歴について簡単に教えてください。",
  "confirmationTargets": ["name", "work_experience"],
  "reason": "面接冒頭で本人情報と経歴概要を確認するため"
}
```

## 6. 回答分析

### 6.1 用途

ユーザ回答を分析し、抽象度、具体性、登録情報との差異、深掘り要否を判定する。

### 6.2 入力

```ts
type AnswerAnalysisInput = GeminiBaseContext & {
  question: {
    id: string;
    type: string;
    text: string;
  };
  answer: {
    id: string;
    text: string;
    inputType: "speech" | "text";
    speechTranscriptConfidence?: number | null;
  };
};
```

### 6.3 プロンプトテンプレート

```text
以下の質問と回答を分析してください。

分析観点:
- 回答が抽象的か
- 具体的な事実、数値、行動、成果が含まれているか
- 登録プロフィールと回答内容に差異の可能性があるか
- 深掘り質問が必要か
- 次に行うべきアクションは何か

注意:
- 矛盾は断定せず、確認候補として出してください。
- 登録情報に根拠がない場合は矛盾候補にしないでください。
- 音声認識の誤りがあり得る場合は、強い断定を避けてください。

プロフィール:
{{profile}}

面接条件:
{{interviewCondition}}

質問:
{{question}}

回答:
{{answer}}

会話履歴:
{{conversation}}
```

### 6.4 出力Schema

```ts
type AnswerAnalysisOutput = {
  abstractness: "low" | "medium" | "high";
  specificity: "low" | "medium" | "high";
  consistency: "consistent" | "needs_confirmation" | "contradictory";
  contradictionCandidates: Array<{
    description: string;
    severity: "low" | "medium" | "high";
    evidence: string[];
    confirmationQuestionHint: string;
  }>;
  deepDiveNeeded: boolean;
  deepDiveReasons: string[];
  nextAction:
    | "generate_normal_question"
    | "generate_deep_dive_question"
    | "generate_confirmation_question"
    | "finish_interview";
  evaluatorComment: string;
};
```

### 6.5 判定基準

| 項目 | low | medium | high |
|---|---|---|---|
| `abstractness` | 具体的 | 一部抽象的 | ほぼ抽象的 |
| `specificity` | 具体性が低い | 一部具体的 | 十分具体的 |

`consistency` の基準:

| 値 | 内容 |
|---|---|
| `consistent` | 登録情報や過去回答と目立つ差異がない |
| `needs_confirmation` | 差異の可能性があり、確認質問が必要 |
| `contradictory` | 明確な不整合がある。ただし画面では確認候補として扱う |

### 6.6 出力例

```json
{
  "abstractness": "medium",
  "specificity": "low",
  "consistency": "needs_confirmation",
  "contradictionCandidates": [
    {
      "description": "登録職歴の開始年月と、回答内の取り組み時期に差異の可能性があります。",
      "severity": "medium",
      "evidence": ["profile.workExperiences[0].startYearMonth", "utt_008"],
      "confirmationQuestionHint": "その取り組みを始めた時期を確認する"
    }
  ],
  "deepDiveNeeded": true,
  "deepDiveReasons": ["成果の数値が不足している", "自分の担当範囲が不明確"],
  "nextAction": "generate_confirmation_question",
  "evaluatorComment": "取り組み内容は伝わっていますが、成果規模と時期を確認するとより明確になります。"
}
```

## 7. 次質問生成

### 7.1 用途

通常質問、深掘り質問、確認質問のいずれかを生成する。

### 7.2 入力

```ts
type NextQuestionInput = GeminiBaseContext & {
  reason: "normal" | "deep_dive" | "confirmation";
  baseAnswer?: {
    id: string;
    text: string;
    analysis?: AnswerAnalysisOutput;
  };
};
```

### 7.3 プロンプトテンプレート

```text
以下の情報をもとに、次の面接質問を1つ生成してください。

質問種別:
{{reason}}

生成ルール:
- 通常質問の場合は、面接条件と未確認の観点に沿う
- 深掘り質問の場合は、直前回答の抽象部分を具体化する
- 確認質問の場合は、矛盾候補や不明点を穏やかに確認する
- 質問は1つだけにする
- 質問文は丁寧で自然な日本語にする

プロフィール:
{{profile}}

面接条件:
{{interviewCondition}}

対象回答:
{{baseAnswer}}

会話履歴:
{{conversation}}
```

### 7.4 出力Schema

```ts
type NextQuestionOutput = {
  questionType: "normal" | "deep_dive" | "confirmation";
  questionText: string;
  reason: string;
  referenceAnswerId?: string;
  expectedAnswerFocus: string[];
};
```

### 7.5 出力例

```json
{
  "questionType": "deep_dive",
  "questionText": "その自動化によって、作業時間や対応件数はどの程度変化しましたか。",
  "reason": "成果の規模を数値で確認するため",
  "referenceAnswerId": "ans_003",
  "expectedAnswerFocus": ["作業時間", "件数", "改善前後の比較"]
}
```

## 8. フィードバック生成

### 8.1 用途

面接終了後に、会話履歴全体を分析し、総評、良かった点、抽象的だった箇所、矛盾候補、深掘り不足、改善回答例を生成する。

### 8.2 入力

```ts
type FeedbackInput = GeminiBaseContext & {
  answers: Array<{
    id: string;
    questionId: string;
    text: string;
    analysis?: AnswerAnalysisOutput;
  }>;
};
```

### 8.3 プロンプトテンプレート

```text
以下の面接練習全体を分析し、フィードバックを生成してください。

分析観点:
- 良かった点
- 抽象的だった回答
- 登録情報や会話履歴との矛盾候補
- 深掘り不足
- 次回練習テーマ
- 改善回答例

注意:
- ユーザを否定せず、改善につながる表現にしてください。
- 矛盾候補は断定せず、確認候補として扱ってください。
- 改善回答例は、ユーザの元回答をもとに自然に改善してください。
- 根拠となるテキストデータを含めてください。

プロフィール:
{{profile}}

面接条件:
{{interviewCondition}}

会話履歴:
{{conversation}}

回答分析結果:
{{answers}}
```

### 8.4 出力Schema

```ts
type FeedbackOutput = {
  overallSummary: string;
  goodPoints: Array<{
    title: string;
    description: string;
    evidenceUtteranceIds: string[];
  }>;
  abstractPoints: Array<{
    targetText: string;
    reason: string;
    improvementHint: string;
    evidenceUtteranceIds: string[];
  }>;
  consistencyCandidates: Array<{
    description: string;
    severity: "low" | "medium" | "high";
    evidenceUtteranceIds: string[];
    confirmationHint: string;
  }>;
  deepDiveShortage: string[];
  improvedAnswerExample: string;
  nextPracticeThemes: string[];
};
```

### 8.5 出力例

```json
{
  "overallSummary": "経験の流れは明確で、業務改善に主体的に取り組んだ点が伝わっています。一方で、成果を数値で説明すると説得力が高まります。",
  "goodPoints": [
    {
      "title": "主体性が伝わる",
      "description": "自ら業務改善に取り組んだ姿勢が説明されています。",
      "evidenceUtteranceIds": ["utt_008"]
    }
  ],
  "abstractPoints": [
    {
      "targetText": "効率化できました",
      "reason": "どの程度効率化できたかが不明確です。",
      "improvementHint": "時間、件数、割合などで補足してください。",
      "evidenceUtteranceIds": ["utt_008"]
    }
  ],
  "consistencyCandidates": [
    {
      "description": "登録職歴の在籍期間と回答内の取り組み時期に差異の可能性があります。",
      "severity": "medium",
      "evidenceUtteranceIds": ["utt_004", "utt_008"],
      "confirmationHint": "取り組みを開始した年月を確認する"
    }
  ],
  "deepDiveShortage": ["成果の数値", "自分が担当した範囲", "改善前後の比較"],
  "improvedAnswerExample": "問い合わせ対応の月次集計を自動化した結果、作業時間を月6時間削減しました。私は集計手順の整理とスクリプト作成を担当し、確認作業に使える時間を増やしました。",
  "nextPracticeThemes": ["成果を数値で説明する", "担当範囲を明確にする"]
}
```

## 9. プロンプト組み立て実装

### 9.1 ファイル配置

```text
src/
  prompts/
    common.prompt.ts
    initial-question.prompt.ts
    answer-analysis.prompt.ts
    next-question.prompt.ts
    feedback.prompt.ts
```

### 9.2 PromptBuilder

```ts
type PromptBuildResult = {
  systemInstruction: string;
  userPrompt: string;
  responseSchema: unknown;
};
```

| Builder | 内容 |
|---|---|
| `buildInitialQuestionPrompt` | 初回質問生成用 |
| `buildAnswerAnalysisPrompt` | 回答分析用 |
| `buildNextQuestionPrompt` | 次質問生成用 |
| `buildFeedbackPrompt` | フィードバック生成用 |

## 10. 入力データ制限

| 項目 | 方針 |
|---|---|
| 会話履歴 | MVPでは全件投入。長くなったら要約を検討 |
| プロフィール | 必要項目のみ投入 |
| 回答分析結果 | フィードバック生成時に投入 |
| 音声データ | 投入しない |
| APIキー | 投入しない |

## 11. 失敗時の扱い

| 用途 | 失敗時 |
|---|---|
| 初回質問生成 | 固定質問で継続可能 |
| 回答分析 | 回答は保存し、再分析可能にする |
| 次質問生成 | 再試行、または固定質問で継続 |
| フィードバック生成 | ジョブ失敗として保存し、再生成可能にする |
| Schema不一致 | 1回だけ再試行し、それでも失敗したらエラー |

## 12. テスト観点

| 対象 | テスト観点 |
|---|---|
| InitialQuestionPrompt | 必須確認対象が含まれる |
| AnswerAnalysisPrompt | 矛盾候補を断定しない |
| NextQuestionPrompt | reasonに応じた質問種別になる |
| FeedbackPrompt | 根拠発話IDが出力される |
| Schema | 必須項目、enum、配列型が守られる |
| Safety | 個人情報を不要に増幅しない |

## 13. 実装順序

1. 共通system instructionを作成
2. 各出力SchemaをZodで定義
3. PromptBuilderを作成
4. GeminiClientにStructured Outputs呼び出しを実装
5. 回答分析から接続
6. 質問生成へ接続
7. フィードバックジョブへ接続
8. Schema不一致時の再試行を実装
