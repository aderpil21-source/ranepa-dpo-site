# Owl v2 — production asset specification

Branch: `feature/owl-v2-realistic`

## Goal
One premium photorealistic owl used as the site assistant. The owl stays on the oak branch and never flies.

## Character
- realistic Eurasian eagle-owl / long-eared-owl visual direction
- serious, intelligent, prestigious, friendly
- amber eyes
- natural brown/cream plumage
- no cartoon proportions, no human gestures, no costume
- visual continuity with the currently approved `img/owl-professional.webp`

## Motion
The animation must read as a living bird, not as a translated still image.

Required:
- slow, clearly visible chest breathing
- rare natural blink
- small head turns
- subtle eye direction changes
- minor feather settling
- genuine walking along the branch
- left foot and right foot alternate
- visible weight transfer before each step
- toes/claws release, move and grip the bark again
- body follows the legs with natural vertical compensation
- head remains relatively stabilized while walking
- pauses between short walks
- no flying, jumping or exaggerated bobbing

## Timing
Target master loop: 10–14 s.

Suggested beat:
- 0–2.5 s: resting, breathing, one subtle gaze change
- 2.5–5.5 s: 2–3 deliberate steps to the right
- 5.5–7.5 s: stop, grip bark, blink, slight head turn
- 7.5–10.5 s: 2–3 steps back
- 10.5–14 s: settle feathers and return to loop pose

The first and last frames should be visually compatible enough for a seamless loop.

## Composition
The video contains the owl only; the branch is rendered by the website underneath it.

- transparent background preferred
- if alpha video cannot be generated: use an evenly lit pure green or pure blue background with no spill on feathers, for chroma-key post-processing
- stationary camera
- no camera zoom/pan
- no background objects
- no shadow baked onto an imaginary floor
- full owl including feet and claws always stays inside frame
- owl may move horizontally inside the frame but must not be cropped

## Website canvas
The site stage is approximately 390 × 260 CSS px on desktop.
Generate at least 640 × 480 source resolution.

Foot contact line should remain near the lower 12–18% of the video frame so it aligns with the branch.

## Audio
No audio track.

## Deliverables
Preferred:
- `img/owl-main.webm` — transparent WebM, full motion
- `img/owl-main-lite.webm` — lighter encode for low-power devices
- `img/owl-professional.webp` — existing poster/fallback

Performance targets:
- full file ideally <= 2.5 MB
- lite file ideally <= 1.2 MB
- loop/autoplay/muted/playsinline
- static fallback for reduced-motion/save-data devices

## Generation prompt
Photorealistic Eurasian eagle-owl matching the supplied reference owl, isolated on a transparent background (or perfectly even chroma green if alpha is unavailable), fixed camera, full body and both feet visible. The owl is serious, intelligent and calm with amber eyes and detailed natural brown and cream feathers. It rests, breathes visibly through the chest, blinks rarely and naturally, makes small controlled head turns and subtle eye movements. Then it walks several deliberate steps sideways as a real owl would: left and right feet alternate, each foot releases the bark, moves, toes and claws visibly curl and grip again, body weight transfers over the supporting leg, chest and body follow with natural vertical motion while the head remains comparatively stable. It pauses, grips the perch, subtly settles its feathers, then walks back. No flying, no hopping, no cartoon motion, no sliding body, no fake attached claws, no camera movement. Seamless calm loop, premium institutional visual style, realistic anatomy and physics, no audio.
