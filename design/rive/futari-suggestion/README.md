# Futari Suggestion

ホームの「次のデート、こんなのはどう？」用Riveキャラクター。
参照シートをもとに、待機→キャラクターの左手（画面右）を吹き出しへ差し出す→笑顔→待機→もう一度提案→待機の10秒ループをネイティブベクターで作成。

- Artboard: `Futari Suggestion` / 320 × 340 / 透明背景
- State machine: `Suggestion`
- Timelines: `Suggest` / 60fps / 600 frames / loop、`Breathing` / 264 frames / loop
- 2つのレイヤーを同時再生。浮遊は2.2秒で20px上下（ホーム表示では約5px）、4.4秒周期で左右約1.4度の揺れし、待機中も継続。伸縮・顔のずれ・体を引く予備動作はなく、短いまばたきを追加。腕の先の丸い手が吹き出しへ動きます。
- Riveファイル: `exports/futari-suggestion.riv`（アプリ配信版は `public/animations/futari-suggestion.riv`）
- 静止画: `exports/futari-suggestion-static.svg`
- 編集用: `scene.rml`、生成定義: `tools/build_scene.py`
- スクリプト・外部画像・外部フォントなし。外側のリアクションマークなし。

吹き出しはホーム画面のHTML/CSSで表示し、提案のテキストとクリック操作を維持。
再生は共通 `src/components/rive-mascot.tsx`。画面外、背景タブ、ホームにシート表示中は停止。
動きを減らす設定では静止画。WASM・画像・Riveファイルはすべて同一オリジンから読み込み。

## Rebuild

公式Rive CLI 1.1.0（今回の一時インストール: `/tmp/futari-rive-cli/bin/rive`）。

```sh
python3 design/rive/futari-suggestion/tools/build_scene.py
rive design/rive/futari-suggestion --verify
rive inspect design/rive/futari-suggestion --summary
rive design/rive/futari-suggestion --once
cp design/rive/futari-suggestion/build/futari-suggestion.riv public/animations/futari-suggestion.riv
cp design/rive/futari-suggestion/build/futari-suggestion.riv design/rive/futari-suggestion/exports/futari-suggestion.riv
cp design/rive/futari-suggestion/exports/futari-suggestion-static.svg public/animations/futari-suggestion-static.svg
rive design/rive/futari-suggestion
```

エディター形式 `.rev` の書き出しは `rive login` 後に `--once --rev=<出力先>`。
クラウドへのアップロード・公開はしていません。

ボディは両キャラクター共通の、横幅を広げて上部・側面を丸くした輪郭です。
