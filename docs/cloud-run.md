# Cloud Run 公開（手元 PC）

Cloud Agent では **Google ログインを行いません**。この VM から `gcloud` / Cloud Run への push はできません。公開は gcloud ログイン済みの手元 PC で、次の1コマンドです。

```bash
# リポジトリ直下。`.env.local` に Firebase / OrcaRouter / Maps があること
npm run deploy:cloudrun
```

既定プロジェクトは **`futari-log-agent`**、リージョン `asia-northeast1`、サービス名 `futari-log`。上書きするときだけ:

```bash
PROJECT_ID=futari-log-agent REGION=asia-northeast1 npm run deploy:cloudrun
```

初回デプロイの `APP_RUNTIME` は **MOCK**（本物の匿名 Auth + Firestore、推論と地図はキーが無ければモック）。画面確認用。LIVE にするとき:

```bash
DEPLOY_RUNTIME=LIVE npm run deploy:cloudrun
```

終わると Cloud Run URL を表示し、`/api/health` を叩きます。ブラウザでその URL を開けば確認できます。

```bash
curl -sS "$CLOUD_RUN_URL/api/health"
# {"ok":true,"runtime":"MOCK","authBackend":"firebase","dataBackend":"firestore","emulator":false}

DEMO_BASE_URL="$CLOUD_RUN_URL" npm run demo:live
```

提案の実行は Cloud Workflows（`docs/workflows.md`）。gather → propose。


## スクリプトがやること

`scripts/deploy-cloud-run.sh` は次を冪等に実行します。秘密は git に出さず、`.env.local` から Secret Manager へ入れます。

1. API 有効化（Run / Artifact Registry / Cloud Build / Secret Manager / Firestore / Identity Toolkit / Places / Routes）
2. Artifact Registry `futari-log`、Firestore Native（未作成なら）
3. Secret: `ORCAROUTER_API_KEY` `GOOGLE_MAPS_API_KEY` `NEXT_PUBLIC_FIREBASE_API_KEY` `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` `NEXT_PUBLIC_FIREBASE_APP_ID`
4. Cloud Build SA と Compute SA へ IAM（Run admin、Secret Accessor、Datastore user、Firebase Auth admin など）
5. `firebase deploy --only firestore:rules,firestore:indexes`（firebase-tools があるとき）
6. `gcloud builds submit --config cloudbuild.yaml`
7. 匿名 Auth 有効化と、Cloud Run ホストの Authorized domains 追加

## このリポジトリが用意しているもの

- `firebase.json` / `.firebaserc` / `firestore.rules` … Emulator と本番ルール
- `Dockerfile` / `cloudbuild.yaml` … Web + 常駐 worker を 1 コンテナ（`PORT` 対応）
- `.gcloudignore` … `.env.local` を Cloud Build に送らない
- サーバーは Admin SDK で Firestore に書き込みます。クライアントからの直接 write はルールで拒否します
- 認証は **匿名 Auth を既定**とし、任意で Google に昇格できる（下記「認証方針」）
- セッション Cookie（`futari_token`）は httpOnly。ブラウザは Firebase Client SDK の idToken を `/api/auth/session` で交換する

## 認証方針（Google ログイン）

- 現行の匿名認証は残す。ログインは任意。
- 匿名ユーザーは `linkWithPopup` で Google を紐づけて昇格する。UID を変えないため、既存のカップル・セッション・記憶・`ownerUid` を引き継ぐ。
- `auth/credential-already-in-use` のときはデータを統合しない。ログイン前に「別アカウントに紐づいている／切り替えると今見えているデータは表示されなくなる」旨を伝え、同意後のみ `signInWithPopup` で切り替える。

### 既存の Cookie のみの匿名セッションは移行しない

理由:
- カスタムトークン交換は、以前の計測で IAM 拒否（`signBlob` 権限不足）が確認されている
- サーバ匿名の refresh token をクライアントに渡す方法は、SDK に正式な受け口がない
- 既存の匿名ユーザーは計測用・テスト用のデータであり、守るべき実利用者がいない

具体的な挙動:
- クライアントに Firebase ユーザーがいれば、その idToken を `/api/auth/session` で交換する
- いなくても、有効な既存 Cookie があれば、それを使って匿名のまま利用を継続できる
- 既存 Cookie のセッションでログインを押した場合は、新しいアカウントで始まり、現在のデータは引き継がれないことを押す前に伝える
- どちらも無ければ `signInAnonymously` で開始する

`POST /api/auth/anonymous` は計測スクリプト用に残す。

手動設定（コンソール / IAM はスクリプトで変更しない）:
- Google プロバイダの有効化
- 承認済みドメインへ `localhost` と Cloud Run ホストを追加
- OAuth 同意画面の確認

Cloud Run では worker がポーリングし続ける必要があるため、**CPU スロットリングなし・min instances 1** です。課金はその前提です。

## 手動で分ける場合

ログインだけ先に済んでいるなら、スクリプトを使わずに:

```bash
export PROJECT_ID=futari-log-agent
export REGION=asia-northeast1
gcloud config set project "$PROJECT_ID"
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION="$REGION",_SERVICE=futari-log,_AR_REPO=futari-log
```

Secret と IAM が未作成だとこのコマンド単体は失敗します。そのときは `npm run deploy:cloudrun` を使ってください。

## Cloud Agent ではやらないこと

- `gcloud auth login` / `firebase login`
- 実 Firebase プロジェクトの作成
- Cloud Run への push / 公開

こちらでは `npm run dev`（Auth + Firestore Emulator）と `npm run test:emulator` で同じコードパスを検証します。
