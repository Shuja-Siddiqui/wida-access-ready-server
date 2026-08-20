/**
 * MATH subject prompt block — academic math listening guidelines.
 * Inject after LISTENING_CORE_BLOCK when subject = "math".
 */

export const MATH_SUBJECT_BLOCK = `━━ SUBJECT: Mathematics (Grade 6–8 Common Core) ━━

PASSAGE FORMAT — Word Problem Read Aloud
A teacher reads a real-world word problem aloud. Must:
• Include specific numbers (quantities, prices, distances, times, measurements)
• Describe a clear mathematical situation with one or two quantities or relationships
• NOT ask the student to compute — set up the situation only
• Begin naturally: "Listen carefully. Maria has…" / "A store sells…"
• Use tier3_vocabulary naturally, defining technical terms inline: "The unit rate, which tells us the cost per one item, is…"
• is_retry: change names, numbers, or setting; keep the same math_unit

PERMITTED FORMATS (agree_disagree excluded — math claims don't map to that format)
  multiple_choice    → 4 options; wrong options reflect mathematical misreadings (unit confusion, swapped quantities)
  sequence_ordering  → 3–4 steps of a described procedure; tests whether the student followed the sequence
  pair_matching      → 3–4 pairs; match quantities to roles, terms to meanings, or steps to outcomes
Vary formats. sequence_ordering and pair_matching are especially effective for multi-step problems.

WHAT QUESTIONS MUST TEST (math language comprehension — never computation)
  ✓ "How much does one pound of apples cost?" — given information
  ✓ "What does the problem ask Maria to find?" — the mathematical goal
  ✗ NEVER: "What is the total cost?" / "What is 12 × 3?" — computation, not comprehension`.trim();

/**
 * Visual tags that commonly appear in school photo libraries and
 * can serve as real-world anchors for math academic content.
 */
export const MATH_VISUAL_ANCHOR_TAGS: string[] = [
  "ruler", "calculator", "coins", "clock", "scale",
  "apple", "fruit", "pizza", "table", "chair",
  "tray", "bottle", "shelf", "jar", "cup",
  "pencil", "book", "bag", "box",
];

export const MATH_OUTPUT_SCHEMA = `OUTPUT
{
  "can_do_descriptor": "<action + one Can Do item that best fits this math problem>",
  "audio_script": "<word problem read aloud by teacher — plain spoken English, no symbols>",
  "topic": "<echo input topic>",
  "context": "Teacher reading a word problem aloud to the class",
  "format": "<primary question format used>",
  "questions": [
    {
      "id": "1",
      "type": "<multiple_choice|sequence_ordering|pair_matching>",
      "question": "<tests comprehension of math language — no computation>",
      "options": ["A", "B", "C", "D"],
      "correct": 0,
      "explanation": "<max 8 words>"
    }
  ]
}`.trim();
