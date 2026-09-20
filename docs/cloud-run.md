# Cloud Run 公開準備と手元 PC で必要な操作

Cloud Agent では **Google ログインを行いません**。Auth / Firestore は Emulator で実装・テスト済みです。実プロジェクトの作成、匿名 Auth の有効化、Secret 登録、Cloud Run へのデプロイは手元 PC で実行してください。

## このリポジトリが用意しているもの

- `firebase.json` / `.firebaserc` / `firestore.rules` … Emulator と本番ルール
- `Dockerfile` / `cloudbuild.yaml` … Web + worker を 1 コンテナで起動（`PORT` 対応）
- サーバーは Admin SDK で Firestore に書き込みます。クライアントからの直接 write はルールで拒否します
- 認証は **匿名 Auth**（Google ログインは使いません）。セッション Cookie は httpOnly

Cloud Run では worker がポーリングし続ける必要があるため、**CPU スロットリングなし・min instances 1** を前提にしています。

## 手元 PC（Google ログインが必要な作業）

### 1. ツール

```bash
# Node 22、gcloud、firebase-tools、Docker
gcloud auth login
gcloud auth application-default login
firebase login
```

### 2. GCP / Firebase プロジェクト

```bash
export PROJECT_ID=your-project-id          # 実 ID。捏造しない
export REGION=asia-northeast1
gcloud config set project "$PROJECT_ID"

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  identitytoolkit.googleapis.com \
  firebase.googleapis.com
```

Firebase Console で同じプロジェクトを Firebase に追加し、次を行う。

1. Authentication → Sign-in method → **Anonymous を有効化**
2. Firestore Database → **Native mode** で作成（リージョンは `asia-northeast1` 推奨）
3. プロジェクト設定から Web アプリを登録し、次を控える（値はここに書かない）
   - `apiKey` / `authDomain` / `projectId` / `appId`

```bash
firebase use "$PROJECT_ID"
firebase deploy --only firestore:rules,firestore:indexes
```

### 3. Secret Manager

公開 API キーも Cloud Run の環境に載せるので Secret にする。

```bash
printf '%s' 'YOUR_ORCAROUTER_API_KEY' | gcloud secrets create ORCAROUTER_API_KEY --data-file=-
printf '%s' 'YOUR_GOOGLE_MAPS_API_KEY' | gcloud secrets create GOOGLE_MAPS_API_KEY --data-file=-
printf '%s' 'YOUR_FIREBASE_WEB_API_KEY' | gcloud secrets create NEXT_PUBLIC_FIREBASE_API_KEY --data-file=-
printf '%s' "$PROJECT_ID.firebaseapp.com" | gcloud secrets create NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN --data-file=-
printf '%s' 'YOUR_FIREBASE_APP_ID' | gcloud secrets create NEXT_PUBLIC_FIREBASE_APP_ID --data-file=-
```

既存 Secret を更新する場合は `gcloud secrets versions add ...`。

Cloud Build のサービスアカウントに `roles/secretmanager.secretAccessor`、`roles/run.admin`、Artifact Registry 書き込みを付与する。

### 4. Artifact Registry

```bash
gcloud artifacts repositories create futari-log \
  --repository-format=docker \
  --location="$REGION"
```

### 5. デプロイ

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION="$REGION",_SERVICE=futari-log,_AR_REPO=futari-log
```

初回だけ、Cloud Run のランタイムサービスアカウントに次を付与する。

- `roles/datastore.user`（Firestore）
- `roles/firebaseauth.admin`（匿名ユーザー発行とセッション Cookie）
- `roles/secretmanager.secretAccessor`

### 6. Firebase 許可ドメイン

デプロイ後の Cloud Run URL（例 `https://futari-log-xxxxx-an.a.run.app`）を Firebase Authentication → Settings → **Authorized domains** に追加する。追加した URL を README の「許可ドメイン」欄に記録する。

### 7. 公開後の確認

```bash
curl -sS "$CLOUD_RUN_URL/api/health"
# {"ok":true,"runtime":"MOCK","authBackend":"firebase","dataBackend":"firestore","emulator":false}

# 匿名 Auth → 通し（キーが揃うまで推論と地図はモック）
DEMO_BASE_URL="$CLOUD_RUN_URL" npm run demo:live
```

LIVE にするのは `ORCAROUTER_API_KEY` と `GOOGLE_MAPS_API_KEY` が実キーで、Named Router 名がダッシュボードと一致し、`APP_RUNTIME=LIVE` を Cloud Run にセットしたときだけ。Emulator では LIVE 判定しません。

## Cloud Agent ではやらないこと

- `gcloud auth login` / `firebase login`
- 実 Firebase プロジェクトの作成
- Cloud Run への push / 公開

こちらでは `npm run dev`（Auth + Firestore Emulator）と `npm run test:emulator` で同じコードパスを検証します。
