/**
 * ELA subject prompt block — academic ELA listening guidelines.
 * Inject after LISTENING_CORE_BLOCK when subject = "ela".
 */

export const ELA_SUBJECT_BLOCK = `━━ SUBJECT: English Language Arts (Grade 6–8 — Literary & Informational Text, Author's Craft, Argument) ━━

PASSAGE FORMAT — Text Read Aloud
A teacher reads a short literary or informational text aloud. Genre depends on ela_genre:
  narrative      → short story excerpt or personal narrative (character, conflict, setting, resolution)
  informational  → explanatory text (main idea, supporting details, text structure)
  argument       → opinion text (claim, evidence, counterclaim)
  author_craft   → excerpt with notable craft choices (figurative language, tone, point of view, word choice)

Must:
• Be polished read-aloud prose — NOT a writing prompt or instructions
• Use tier3_vocabulary naturally, defining literary terms inline:
  "The author uses a simile — a comparison using 'like' or 'as' — when she writes 'the thunder rolled like a freight train.'"
• Provide enough context for questions about literary elements, text structure, or the author's choices
• is_retry: different character, topic, or setting; same ela_unit and literary focus

PERMITTED FORMATS (use all four — vary them)
  multiple_choice    → 4 options; wrong options are realistic misreadings or over-interpretations
  sequence_ordering  → 3–4 events or steps in a narrative, argument structure, or informational sequence
  pair_matching      → 3–4 pairs; match literary terms to examples in the text or causes to effects
  agree_disagree     → a claim about the text, author's purpose, or character motivation

WHAT QUESTIONS MUST TEST (textual/literary comprehension — never prior knowledge)
  ✓ "According to the passage, what is the main problem the character faces?" — narrative comprehension
  ✓ "What does the author compare the storm to in this passage?" — figurative language in text
  ✗ NEVER: "Define metaphor." / "What is a protagonist?" — answerable without listening`.trim();

/**
 * Visual tags that can serve as real-world anchors for ELA academic content.
 */
export const ELA_VISUAL_ANCHOR_TAGS: string[] = [
  "book", "pencil", "paper", "notebook", "library",
  "person", "student", "teacher", "child", "family",
  "friend", "park", "school", "classroom", "window",
  "door", "garden", "tree", "bench", "street",
];

export const ELA_OUTPUT_SCHEMA = `OUTPUT
{
  "can_do_descriptor": "<action + one Can Do item that fits this ELA passage>",
  "audio_script": "<literary or informational text read aloud — polished prose>",
  "topic": "<echo input topic>",
  "context": "<one sentence: who reads this aloud and to whom>",
  "format": "<primary question format used>",
  "questions": [
    {
      "id": "1",
      "type": "<multiple_choice|sequence_ordering|pair_matching|agree_disagree>",
      "question": "<tests literary/textual comprehension — no prior knowledge required>",
      "options": ["A", "B", "C", "D"],
      "correct": 0,
      "explanation": "<max 8 words>"
    }
  ]
}`.trim();
