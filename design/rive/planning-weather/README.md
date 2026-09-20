# Loading characters

Four simplified native SVG characters: weather (sun only), shop (awning and building), route (green location pin), plan (bulb). No props, text, or reaction marks.

Run `python3 design/rive/planning-weather/tools/build_scene.py` to regenerate all SVGs and the weather RML. The weather artboard is 160×160, state machine `Weather`, 4-second `Gentle smile` loop with 2-second subtle vertical motion. No body scaling. The other three characters remain static SVGs for review.

Build with `rive design/rive/planning-weather --verify`, `rive inspect design/rive/planning-weather --summary`, then `rive design/rive/planning-weather --once`. Copy build/planning-weather.riv to exports and public/animations. Preview with `rive design/rive/planning-weather`.

Integrated in src/features/session/plan-loading.tsx with shared Rive lifecycle, reduced-motion poster, and self-hosted WASM. SVGs and the .riv file are in exports/ and public/animations/.
