# Google OAuth 本番接続手順

対象環境:

- Project: `winter-sensor-459208-h8`
- Cloud Run: `interview-backend`
- App origin: `https://interview-backend-lz44oy5pza-an.a.run.app`
- Redirect URI: `https://interview-backend-lz44oy5pza-an.a.run.app/api/v1/auth/google/callback`

## 1. Google Auth Platformを設定する

Google Cloud Consoleでプロジェクト `winter-sensor-459208-h8` を開き、`Google Auth Platform`へ移動する。

1. `Branding`でアプリ名、サポートメール、連絡先メールを登録する。
2. `Audience`は開発中であれば`External`かつ`Testing`を選ぶ。
3. `Test users`へ実際にログイン確認するGoogleアカウントを追加する。
4. `Data Access`では`openid`、`email`、`profile`の基本スコープだけを使用する。

## 2. OAuthクライアントを作成する

`Google Auth Platform`の`Clients`からクライアントを作成する。

| 項目 | 設定値 |
|---|---|
| Application type | Web application |
| Name | AI Interview Practice Production |
| Authorized JavaScript origins | `https://interview-backend-lz44oy5pza-an.a.run.app` |
| Authorized redirect URIs | `https://interview-backend-lz44oy5pza-an.a.run.app/api/v1/auth/google/callback` |

作成後に表示されるClient IDとClient Secretを保存する。チャット、GitHub、ソースコードへ貼り付けない。

## 3. Secret Managerへ登録する

Cloud Shellで次を実行する。入力文字は画面に表示されず、シェル履歴にも値を残さない。

```bash
export PROJECT_ID="winter-sensor-459208-h8"
export RUNTIME_SA="interview-backend-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "${PROJECT_ID}"

read -rsp "OAuth Client ID: " OAUTH_CLIENT_ID && echo
printf '%s' "${OAUTH_CLIENT_ID}" | gcloud secrets create google-oauth-client-id \
  --project="${PROJECT_ID}" \
  --replication-policy="automatic" \
  --data-file=-
unset OAUTH_CLIENT_ID

read -rsp "OAuth Client Secret: " OAUTH_CLIENT_SECRET && echo
printf '%s' "${OAUTH_CLIENT_SECRET}" | gcloud secrets create google-oauth-client-secret \
  --project="${PROJECT_ID}" \
  --replication-policy="automatic" \
  --data-file=-
unset OAUTH_CLIENT_SECRET
```

同名Secretが既に存在する場合は`create`ではなく、新しいバージョンを追加する。

```bash
read -rsp "OAuth Client Secret: " OAUTH_CLIENT_SECRET && echo
printf '%s' "${OAUTH_CLIENT_SECRET}" | gcloud secrets versions add google-oauth-client-secret \
  --project="${PROJECT_ID}" \
  --data-file=-
unset OAUTH_CLIENT_SECRET
```

## 4. 実行サービスアカウントへ参照権限を付与する

```bash
for SECRET_NAME in google-oauth-client-id google-oauth-client-secret; do
  gcloud secrets add-iam-policy-binding "${SECRET_NAME}" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

値を表示せず、存在とバージョンだけを確認する。

```bash
gcloud secrets list \
  --project="${PROJECT_ID}" \
  --filter="name:(google-oauth-client-id OR google-oauth-client-secret)" \
  --format="table(name,createTime)"

gcloud secrets versions list google-oauth-client-id \
  --project="${PROJECT_ID}" \
  --format="table(name,state,createTime)"

gcloud secrets versions list google-oauth-client-secret \
  --project="${PROJECT_ID}" \
  --format="table(name,state,createTime)"
```

## 5. デプロイと確認

OAuth接続PRをマージすると、GitHub Actionsが次をCloud Runへ設定する。

- `APP_ORIGIN`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_OAUTH_CLIENT_ID`（Secret Manager）
- `GOOGLE_OAUTH_CLIENT_SECRET`（Secret Manager）

現在の本番環境では、誤登録を修正した`google-oauth-client-id`のバージョン2と、`google-oauth-client-secret`のバージョン1を固定参照する。

デプロイ後、アプリをブラウザで開き、Googleログインを実行する。ログイン後にプロフィールを保存し、Firestoreの`users`、`authSessions`、`profiles`コレクションへドキュメントが作成されることを確認する。
