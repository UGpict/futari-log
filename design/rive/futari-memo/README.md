# Futari Memo — interactive Rive character

参照シートをネイティブベクターで描き起こしたキャラクター。考え中の点・完了の線など外側のマークはありません。

## Runtime contract

- Artboard: `Futari Memo`（500 × 500、背景透明）
- State machine: `Memo`
- View model: `MemoControls` / default instance: `Default`
- `Writing`: 2.4秒のメモ記入ループ。入力内容を選んでいる間の通常状態。
- `Next`: 0.65秒の一度きりのリアクション。体・ノートが小さく跳ね、笑顔になります。
- View model trigger `next`: `Writing` → `Next` を70msでブレンド。終了すると `Writing` に戻ります。
- プレビューでは体をクリックして同じトリガーを試せます。アプリ内ではキャンバスのクリック反応を無効化し、次へボタンから発火します。

## App integration

`src/components/memo-mascot.tsx` で公式 `@rive-app/canvas` を遅延ロード。
`src/features/home/plan-form.tsx` の元のハート付き案内欄を置換しています。
次へボタンで `next` を発火し、480ms後に次のステップへ進みます。
連打防止、アンマウント時のタイマー・Rive解放、非表示時の停止、reduced-motion時の静止画表示に対応。
WASMは依存パッケージと同じバージョンを `public/vendor/rive` から配信。ランタイム更新時は両WASMも更新してください。

## Files

- `public/animations/futari-memo.riv`: アプリ配信用（スクリプトなし）
- `public/animations/futari-memo-static.svg`: ロード待ち・失敗・reduced-motion用
- `exports/futari-memo.riv`: 同じランタイムファイル
- `exports/futari-memo-preview.gif`: 記入→リアクション→記入の動作確認。暗い背景はCLIプレビュー背景です。
- `scene.rml`: 編集可能なRive CLIソース
- `tools/build_scene.py`: ベクターとタイムラインの生成定義

## Build

公式CLI: https://www.rive.app/downloads （使用バージョン1.1.0）

```sh
python3 design/rive/futari-memo/tools/build_scene.py
rive design/rive/futari-memo --verify
rive inspect design/rive/futari-memo --summary
rive design/rive/futari-memo --once
cp design/rive/futari-memo/build/futari-memo.riv public/animations/futari-memo.riv
cp design/rive/futari-memo/build/futari-memo.riv design/rive/futari-memo/exports/futari-memo.riv
cp design/rive/futari-memo/exports/futari-memo-static.svg public/animations/futari-memo-static.svg
rive design/rive/futari-memo
```

今回のCLI一時インストール先: `/tmp/futari-rive-cli/bin/rive`。
Riveエディター用 `.rev` の出力には `rive login` が必要です。クラウドへは未アップロード。

## Validation

Rive verify: 0 errors, 0 warnings。inspect: problemsなし。
トリガー後の笑顔と記入への復帰を公式レンダラーで確認。
実ブラウザでRiveキャンバス読み込みとステップ遷移を確認。
TypeScript、対象ESLint、フロント・バックエンド境界チェック通過。

ボディは両キャラクター共通の、横幅を広げて上部・側面を丸くした輪郭です。
