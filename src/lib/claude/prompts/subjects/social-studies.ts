/**
 * SOCIAL STUDIES subject prompt block — academic social studies listening guidelines.
 * Inject after LISTENING_CORE_BLOCK when subject = "social_studies".
 */

export const SOCIAL_STUDIES_SUBJECT_BLOCK = `━━ SUBJECT: Social Studies (C3 Framework — History, Geography, Civics, Economics) ━━

Align to content_framework "C3", D2 indicators in content_standards, and c3_inquiry_dimensions when present.

PASSAGE FORMAT — Teacher or Historian Narration
A teacher or historian narrates an event, concept, or system. Must:
• Tell a clear story with specific names, dates, places, and amounts
• NOT assume prior knowledge — the passage provides all context
• Begin clearly: "Today we're going to look at…" / "Imagine you are living in 1776…"
• Define technical terms inline: "feudalism, a system where peasants worked the lord's land in exchange for protection…"
• Speak dates aloud: "seventeen seventy-six" not "1776"
• is_retry: use a different angle, person, or specific example within the same ss_unit

Choose question types from available_question_formats — pick what best assesses framework.language_functions for this narration.

WHAT QUESTIONS MUST TEST (historical/civic language comprehension — never memorized facts)
  ✓ "According to the teacher, why were colonists angry about the Stamp Act?" — cause from narration
  ✓ "What does 'taxation without representation' mean in this passage?" — term in context
  ✗ NEVER: "Who was the first president?" / "What year did WWII end?" — answerable without listening`.trim();

/**
 * Visual tags that can serve as real-world anchors for social studies academic content.
 */
export const SOCIAL_STUDIES_VISUAL_ANCHOR_TAGS: string[] = [
  "flag", "map", "building", "city", "bridge",
  "monument", "street", "road", "people", "crowd",
  "market", "store", "farm", "factory", "school",
  "library", "book", "newspaper", "sign", "clock",
];

export const SOCIAL_STUDIES_OUTPUT_SCHEMA = `OUTPUT
{
  "can_do_descriptor": "<action + one Can Do item that fits this social studies narration>",
  "audio_script": "<teacher/historian narration — plain spoken English>",
  "topic": "<echo input topic>",
  "context": "Teacher narrating a historical event or social studies concept to the class",
  "format": "<primary question format used>",
  "questions": [
    {
      "id": "1",
      "type": "<multiple_choice|sequence_ordering|pair_matching|agree_disagree>",
      "question": "<tests comprehension of historical/civic language — no memorized-fact recall>",
      "options": ["A", "B", "C"],
      "correct": 0,
      "explanation": "<max 8 words>"
    }
  ]
}`.trim();
