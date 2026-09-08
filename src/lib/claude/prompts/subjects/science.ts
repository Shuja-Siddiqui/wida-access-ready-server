/**
 * SCIENCE subject prompt block — academic science listening guidelines.
 * Inject after LISTENING_CORE_BLOCK when subject = "science".
 */

export const SCIENCE_SUBJECT_BLOCK = `━━ SUBJECT: Science (Grade 6–8 — Life, Physical, Earth & Space Science) ━━

PASSAGE FORMAT — Teacher or Scientist Narration
A teacher or scientist narrates a phenomenon, process, or discovery to the class. Must:
• Describe a real phenomenon using tier3_vocabulary, with analogies to make it concrete:
  "Think of the cell membrane like a security guard — it decides what gets in and out."
• NOT require prior science knowledge — the passage teaches the concept
• Begin clearly: "Today we're going to look at…" / "Imagine you're watching a volcano…"
• Define technical terms inline: "mitosis, which is the process where one cell splits into two…"
• is_retry: use a different analogy, species, or example; same science_unit and concept

PERMITTED FORMATS (use all four — vary them)
  multiple_choice    → 3 options (1 correct + 2 distractors); wrong options are realistic misreadings of the passage
  sequence_ordering  → 3–4 steps of a described process (rock cycle, cell division, etc.)
  pair_matching      → 3–4 pairs; match terms to definitions or causes to effects as stated
  agree_disagree     → a scientific claim; student decides if the passage supports or contradicts it

WHAT QUESTIONS MUST TEST (scientific language comprehension — never memorized facts)
  ✓ "According to the teacher, why do tectonic plates move?" — what the narration explains
  ✓ "What does the teacher say happens when two plates collide?" — cause and effect from narration
  ✗ NEVER: "What is photosynthesis?" / "Name three types of rocks." — answerable without listening`.trim();

/**
 * Visual tags that can serve as real-world anchors for science academic content.
 */
export const SCIENCE_VISUAL_ANCHOR_TAGS: string[] = [
  "plant", "leaf", "flower", "tree", "soil",
  "water", "rock", "sun", "sky", "cloud",
  "bird", "animal", "fish", "grass", "seed",
  "rain", "bottle", "container", "magnifying glass", "microscope",
  "lab", "beaker",
];

export const SCIENCE_OUTPUT_SCHEMA = `OUTPUT
{
  "can_do_descriptor": "<action + one Can Do item that fits this science narration>",
  "audio_script": "<teacher/scientist narration — plain spoken English, no visual references>",
  "topic": "<echo input topic>",
  "context": "Teacher explaining a science concept to the class",
  "format": "<primary question format used>",
  "questions": [
    {
      "id": "1",
      "type": "<multiple_choice|sequence_ordering|pair_matching|agree_disagree>",
      "question": "<tests comprehension of scientific language — no memorized-fact recall>",
      "options": ["A", "B", "C"],
      "correct": 0,
      "explanation": "<max 8 words>"
    }
  ]
}`.trim();
