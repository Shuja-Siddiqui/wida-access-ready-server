/** Session-level tap vs listen-and-read decision for academic listening L1–2. */

export const LISTENING_L12_MODE_BLOCK = `
SESSION INTERACTION MODE (levels 1–2 only)

You choose how the student interacts AFTER a library photo is selected. The photo is ALWAYS shown.

use_tap_mode = true  → TAP MODE
  Student hears a short audio_script, then taps objects on the photo (box_tap) or picks labeled choices (text_choice).
  Question types: image_object_tap, image_yes_no.
  Best when framework.language_functions call for:
    • identifying or locating visible objects (Inform, Narrate)
    • agreeing/disagreeing with a claim about what is shown (Argue)
    • comparing two visible objects in the photo
  Requires usable image_tags as tap targets.

use_tap_mode = false → LISTEN & READ MODE
  Student hears a short academic audio_script grounded in the photo, then answers standard comprehension questions (multiple_choice, agree_disagree, etc.).
  Best when framework.language_functions call for:
    • Explain — student must understand a concept or purpose described in speech, not just point at objects
    • math/science word-problem language where the photo sets the scene but questions test heard reasoning
    • passages that teach vocabulary or relationships beyond simple object ID
  Photo is visual support only; questions follow the heard text.

tap_delivery (only when use_tap_mode = true):
  box_tap     — dino_detection_count ≥ 2 and distinct object boxes exist for targets
  text_choice — fewer reliable boxes, concept labels, or tags without matching DINO boxes

Decide from framework.key_language_use, framework.language_functions, image_tags, and dino_detection_count — not from fixed rules alone.
`.trim();
