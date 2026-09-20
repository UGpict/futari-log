# ふたりログ

二人の希望を調整し、予定が崩れたら組み直し、確かめた記憶を次のデートに活かす Web アプリです。計画する側の1人だけが使います。相手用アカウントはありません。

このリポジトリの既定実行は **MOCK + Auth/Firestore Emulator** です。Google ログインは不要です。OrcaRouter / Google Maps のキーが無い状態でも、名古屋駅周辺の実在スポット・カタログと決定的プランナーで画面と API を通せます。LIVE 合格判定にはモックを使いません。

## 起動

```bash
cp .env.example .env.local   # 秘密は入れない。USE_FIREBASE_EMULATOR=true を確認
npm install
npm run dev                  # Auth/Firestore Emulator + Next.js + worker
```

http://localhost:3000

UI 担当が API なしで画面を触る場合は `docs/ui-handoff.md` と `npm run dev:ui`。
担当境界はルートの `AGENTS.md`。契約変更は `src/contracts/`（両担当の確認）。

- Web: `next dev`
- worker: PENDING の run を lease して処理。サーバーレスの応答終了後に作業を続けません。
- 保存先: Firestore Emulator（`DATA_BACKEND=file` で以前の JSON ファイルにも戻せます）

```bash
npm run typecheck
npm run lint
npm test                 # ファイルストア前提の単体テスト
npm run test:emulator    # 匿名 Auth と Firestore Emulator
npm run build
npm run doctor           # PASS / FAIL / BLOCKED。秘密は出さない
npm run demo:live        # モック通し 1 回（Emulator 起動中に）
npm run demo:five        # 同一版で 5 回。失敗で停止
npm run demo:reset       # 自分の isDemo データだけ。REPLAY は既定で残す
npm run replay:export -- <runId>
```

## 環境変数

`.env.example` を参照。値は捏造しません。

| 変数 | 用途 |
|---|---|
| `USE_FIREBASE_EMULATOR` | `true` で Auth / Firestore Emulator。Cloud Agent の既定 |
| `DATA_BACKEND` | `firestore`（既定、Emulator または本番） / `file` |
| `APP_RUNTIME` | `MOCK`（既定）または `LIVE`（実キーが揃い Emulator ではないときだけ有効） |
| `ORCAROUTER_*` | [OrcaRouter](https://docs.orcarouter.ai/getting-started/quickstart) 実推論と Gemini Web Grounding |
| `GOOGLE_MAPS_API_KEY` | Places New / Routes |
| `GEMINI_MODEL` | 既定 `google/gemini-3.5-flash`。Orca 経由。`GEMINI_API_KEY` は直結したいときだけ |
| Firebase `NEXT_PUBLIC_*` | 本番の匿名 Auth。Emulator 時はプレースホルダでよい |
| `ENABLE_DEMO_CONTROLS` | シナリオ注入。LIVE では `DEMO_ALLOWED_UIDS` に限定 |
| `DEMO_AREA_NAME` / `DEMO_LAT` / `DEMO_LNG` / `DEMO_DATE` | 開発デモの集合エリア |
| `WORKER_CONCURRENCY` | 既定 1 |

Firebase 匿名 Auth の許可ドメインは、手元 PC でプロジェクトを立てたあと Firebase Console に追加し、ここに記録してください。未設定です。手順は `docs/cloud-run.md`。

## 会場・日付

東京の発表会場住所と最寄り駅は未提供です。開発時は **名古屋駅周辺** を明示して使います。発表エリアが確定したとは報告しません。日付は Asia/Tokyo の具体日（既定 `2026-09-19`）で解決します。「土曜」をモデルの今日から想像しません。

## 画面

1. 入力: 日時・公共集合地点・二人予算・希望・時刻固定・自動変更許可
2. セッション: タイムライン、希望、仮定、Plan B、判断トレース
3. 再計画: 雨（注入）と遅延（注入）。AUTO_NOTIFY または APPROVAL
4. 振り返り: 確認1問 → 候補 → 明示承認で記憶
5. 記憶: 編集は再承認、無効化
6. 実行ログ: モデル・ツール・料金（不明は未計上）
7. REPLAY: 再生・停止・段階移動。新規の外部呼び出しなし

右下のコストは「概算¥xx・高性能n回／安価m回」。REPLAY は「収録時のコスト」で今回の課金に足しません。

## デプロイ（Cloud Run）

Cloud Agent からは公開できません（Google ログインなし）。gcloud 済みの手元 PC で:

```bash
npm run deploy:cloudrun          # プロジェクト futari-log-agent
# DEPLOY_RUNTIME=LIVE npm run deploy:cloudrun
```

URL が表示されたらブラウザで開く。詳細は **`docs/cloud-run.md`**。

```bash
npm run build
npm run start            # ローカル本番相当。PORT 未指定なら 3000
```

## 未確認事項

`docs/blockers.md` と `docs/provider-verification.md` を見てください。OrcaRouter キー・会場・Named Router の実名が揃うまで LIVE デモは BLOCKED です。Auth / Firestore は Emulator で通しています。
