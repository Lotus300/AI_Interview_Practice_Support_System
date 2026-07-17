# Google Cloud AI・Cloud Tasks本番設定

本番Backendは、Speech-to-Text V2、Vertex AI Gemini、Cloud Tasks、Cloud Run CPU版VOICEVOXを利用する。ローカル音声・AIモデルは使用しない。

## 1. APIを有効化

```bash
gcloud services enable \
  aiplatform.googleapis.com \
  cloudtasks.googleapis.com \
  speech.googleapis.com \
  --project="${PROJECT_ID}"
```

## 2. Cloud Tasksキューを作成

```bash
gcloud tasks queues create "feedback-generation" \
  --project="${PROJECT_ID}" \
  --location="${REGION}" \
  --max-concurrent-dispatches=5 \
  --max-dispatches-per-second=5
```

## 3. Cloud Tasks実行用サービスアカウント

```bash
export TASKS_SA_NAME="feedback-task-invoker"
export TASKS_SA="${TASKS_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create "${TASKS_SA_NAME}" \
  --project="${PROJECT_ID}" \
  --display-name="Feedback Cloud Tasks Invoker"
```

Cloud Runは現在公開URLを使用しているが、内部ジョブAPIはアプリ内でOIDCトークンのaudienceとサービスアカウントemailを検証する。

## 4. Backendランタイム権限

```bash
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/cloudtasks.enqueuer"

gcloud iam service-accounts add-iam-policy-binding "${TASKS_SA}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/iam.serviceAccountUser"
```

既存の `roles/speech.client` と `roles/datastore.user` も維持する。

## 5. Cloud TasksがOIDCトークンを発行する権限

```bash
gcloud iam service-accounts add-iam-policy-binding "${TASKS_SA}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-cloudtasks.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

## 6. GitHub Actions変数

GitHub Actions Variablesへ次を追加する。

```text
FEEDBACK_TASKS_SERVICE_ACCOUNT=feedback-task-invoker@winter-sensor-459208-h8.iam.gserviceaccount.com
```

既存の変数も維持する。

```text
APP_ORIGIN=https://interview-backend-lz44oy5pza-an.a.run.app
VOICEVOX_BASE_URL=https://voicevox-engine-lz44oy5pza-an.a.run.app
```

## 7. デプロイ後確認

```bash
gcloud tasks queues describe "feedback-generation" \
  --project="${PROJECT_ID}" \
  --location="${REGION}"

curl -sS "${SERVICE_URL}/api/v1/health"
```

画面から1問面接を終了し、フィードバック画面が生成中表示になった後、自動的に結果表示へ変わることを確認する。Cloud TasksキューとCloud Runログでは、同じjobIdがqueued、running、succeededの順に遷移していることを確認する。
