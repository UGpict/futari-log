# Futari Flight

Approved SVG source: design/hero/futari-flying.svg. Regenerate with `python3 design/rive/futari-flight/tools/build_scene.py`, then run `rive design/rive/futari-flight --verify`, `rive inspect design/rive/futari-flight --summary`, and `rive design/rive/futari-flight --once`.

Artboard: Futari Flight (720×520). State machine: Flight. Flying timeline: 240 frames at 60 fps, looping. Three staggered rainbow trails move backward and fade out before resetting. Body translates slightly without scaling; bent arm is drawn in front of the torso. SVG blur is approximated with translucent native gradient strokes, so the glow is less diffuse than the reference SVG.

Runtime file copied to exports/futari-flight.riv and public/animations/futari-flight.riv. Static fallback copied from the approved SVG. Integrated into PlanLoading through RiveMascot's flight variant; memo form and home suggestion remain separate. Existing reduced-motion, visibility and cleanup behavior is shared.

The original smiling face is preserved without eyebrows. Both hands and their arm strokes move together slightly. Star and dot drift and pulse; rainbow gradient endpoints rotate continuously over four seconds. Body scale remains fixed.
