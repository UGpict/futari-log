# Welcome flight

600×420 native vector Rive scene. State machine `Welcome`, timeline `Team takeoff`: 10-second loop. Memo leads weather, shop, plan and route out of a phone. Each character emerges, arcs forward, and shrinks uniformly into the distance. No body stretching or added facial features. Static fallback shows all five characters.

Rebuild: `python3 design/rive/futari-welcome/tools/build_scene.py`, then `rive design/rive/futari-welcome --verify`, `rive inspect design/rive/futari-welcome --summary`, `rive design/rive/futari-welcome --once`. Copy build/futari-welcome.riv to exports and public/animations. Source art comes from the flight RML and planning character generator. No cloud upload.

Used in `/auth` and `/auth/login` via RiveMascot welcome variant. Shared visibility, cleanup and reduced-motion behavior. Auth actions unchanged.
