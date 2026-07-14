# VOICEVOX CPU Cloud Run 配置手順

VOICEVOX Engineの公式CPUコンテナを、既存バックエンドと同じ`asia-northeast1`へ非公開Cloud Runサービスとして配置します。

## 構成

| 項目 | 設定 |
| --- | --- |
| Cloud Runサービス | `voicevox-engine` |
| リージョン | GitHub変数`GCP_REGION`（現在は`asia-northeast1`） |
| イメージ | 公式VOICEVOX Engine CPU 0.25.1、amd64ダイジェスト固定 |
| CPU | 4 vCPU |
| メモリ | 8 GiB |
| 同時実行数 | 1 |
| 最小インスタンス | 0 |
| 最大インスタンス | 1 |
| 認証 | 必須 |
| 呼び出し元 | `interview-backend-runtime`のみ |

最小インスタンス0のため、未使用時はインスタンスが停止します。最初の音声合成ではコールドスタートとモデル読み込みの待ち時間が発生します。

## 1. 専用サービスアカウントを作成

Cloud Shellで実行します。VOICEVOX EngineはGoogle Cloud APIへアクセスしないため、このサービスアカウントへプロジェクトロールは付与しません。

```bash
export PROJECT_ID="winter-sensor-459208-h8"
export DEPLOYER_SA="github-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
export VOICEVOX_RUNTIME_SA_NAME="voicevox-runtime"
export VOICEVOX_RUNTIME_SA="${VOICEVOX_RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "${PROJECT_ID}"

gcloud iam service-accounts describe "${VOICEVOX_RUNTIME_SA}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1 || \
gcloud iam service-accounts create "${VOICEVOX_RUNTIME_SA_NAME}" \
  --project="${PROJECT_ID}" \
  --display-name="VOICEVOX Cloud Run Runtime" \
  --description="VOICEVOX Engine専用の無権限ランタイムサービスアカウント"

gcloud iam service-accounts add-iam-policy-binding "${VOICEVOX_RUNTIME_SA}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${DEPLOYER_SA}" \
  --role="roles/iam.serviceAccountUser"
```

確認します。

```bash
gcloud iam service-accounts get-iam-policy "${VOICEVOX_RUNTIME_SA}" \
  --project="${PROJECT_ID}" \
  --format="yaml(bindings)"
```

`github-deployer`に`roles/iam.serviceAccountUser`が付いていれば準備完了です。

## 2. GitHub Actionsを実行

GitHubの以下の画面を開きます。

```text
Actions → Deploy VOICEVOX CPU to Cloud Run → Run workflow
```

ワークフローは次を実行します。

1. Workload Identity FederationでGoogle Cloudへ認証
2. 公式VOICEVOX CPUイメージを非公開Cloud Runへ配置
3. `interview-backend-runtime`へ`roles/run.invoker`を付与
4. Cloud Run URLとイメージダイジェストを表示

## 3. 配置結果を確認

Cloud Shellで実行します。

```bash
export REGION="asia-northeast1"

gcloud run services describe "voicevox-engine" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format="yaml(status.url,spec.template.spec.serviceAccountName,spec.template.spec.containerConcurrency)"

gcloud run services get-iam-policy "voicevox-engine" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format="yaml(bindings)"
```

未認証アクセスが拒否されることも確認します。

```bash
export VOICEVOX_URL="$(gcloud run services describe voicevox-engine \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')"

curl -i "${VOICEVOX_URL}/version"
```

`401`または`403`なら非公開設定は正常です。

## 4. 複数ユーザー対応時の変更方針

初期構成は同時実行1・最大1インスタンスです。利用者が増えた場合は、次の順で変更します。

1. Cloud Monitoringで合成時間、リクエスト待ち、CPU、メモリを確認
2. `--max-instances`を増やす
3. 1インスタンス内の並列合成が安全か負荷試験する
4. 東京CPU版で要件を満たさない場合、GPU対応リージョンまたは別の音声基盤を検討する

音声合成はCPU負荷が高いため、検証なしで`--concurrency`だけを増やさないでください。

## 5. 更新とロールバック

イメージはタグではなくamd64ダイジェストで固定しています。VOICEVOXを更新する場合は、新しい安定版のダイジェストを確認してワークフローの`VOICEVOX_IMAGE`を変更します。

問題がある場合は、Cloud Runの以前のリビジョンへトラフィックを戻します。

```bash
gcloud run revisions list \
  --service="voicevox-engine" \
  --project="${PROJECT_ID}" \
  --region="${REGION}"
```

## 6. Backend APIとの接続

GitHubリポジトリ変数 `VOICEVOX_BASE_URL` に、`voicevox-engine` のCloud Run URLを登録します。

```text
https://voicevox-engine-lz44oy5pza-an.a.run.app
```

Backendのデプロイ時に次の環境変数が設定されます。

```text
VOICEVOX_BASE_URL=${VOICEVOX_BASE_URL}
VOICEVOX_AUTH_MODE=google
VOICEVOX_DEFAULT_SPEAKER_ID=13
VOICEVOX_TIMEOUT_MS=60000
```

BackendはCloud RunのIDトークンを自動取得して、非公開のVOICEVOX Engineへ接続します。生成したWAVはBackendインスタンスのメモリへ2分間だけ保存し、生成を要求したログインユーザーだけが再生できます。

現在はBackendとVOICEVOXの双方を最大1インスタンスとしているため、この一時キャッシュ方式を使用できます。複数インスタンス化するときは、音声の一時保存先をCloud Storage等の共有ストレージへ変更してください。
