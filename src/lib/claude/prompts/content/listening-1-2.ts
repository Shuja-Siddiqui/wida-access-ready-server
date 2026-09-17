/** Listening levels 1–2: one library photo + DINO tags. Count = objects in THAT photo, not extra image files. */

import { ONE_PHOTO_L12 } from "./one-photo-l12";

export const LISTENING_CONTENT_1_2 = `
DOMAIN: LISTENING  |  BAND: 1–2  |  ONE photograph. Student hears audio, then taps boxes or agrees.

${ONE_PHOTO_L12}

image_description → PASSAGE context only. Never copy actions/poses into question text.
image_tags → QUESTIONS only. Every tap target and option is an exact tag string.
integer_level → 1 or 2. Follow that level's object count below.

ONE PHOTO RULE: picture.count means how many DINO tags to build the item around. Never invent a second image file. If the task needs two objects, pick TWO tags in this photo (two bottles, cup and pitcher) and talk about both.

Pick the required tags BEFORE writing the passage. You must have that many tags in image_tags; if not, pick the closest count you can.

You write all question text. Examples below are skill types, not stems to reuse.

LEVEL 1
Narrate → 1 tag (person or place). Passage: a short WHAT HAPPENED / who-where event. type image_object_tap. Write a who/where/what-happened question. Student taps that tag. Do not use a locate-the-object stem.
Inform → 1 tag (familiar object). Passage: facts only (what is there / what it is called). type image_object_tap. Write an identify/name question in your own words; the answer is that tag.
Explain → 1 tag whose job is obvious. Passage states the function. Question is ONLY the function and must NOT contain the object name (e.g. skill type: ask what does the job, not name the object). Student taps the matching tag.
Argue → 2 ideas: Q1 a real tag (agree), Q2 a plausible object NOT in image_tags (disagree). type image_yes_no. Write a full claim sentence for each item (not only "Do you agree or disagree?"). Passage must name BOTH.

LEVEL 2
Narrate → 3 tags. Passage is a mini-story in order using those three objects (first… then… last…). Write sequence questions (first vs last). Student taps the first tag, then the last tag. type image_object_tap.
Inform → 3 tags as a FACT process in order (not a character plot). Passage is a report. Write identify questions for the first-step tag and the last-step tag. type image_object_tap.
Explain → 2 tags. Passage compares or classifies them (bigger/smaller, this vs that) OR cause/effect if both are in the scene. Question asks which object matches (function or attribute). Student taps one of the two. type image_object_tap.
Argue → 2 real tags as visible evidence (more trays than cups). Q1 true claim about those objects (agree). Q2 false claim (disagree). type image_yes_no. Do not use an absent object for L2 Argue.

NEVER put locate-the-object language inside audio_script / passage. Identify stems belong only in Inform questions, and you invent the wording.

Passage: present-simple, typical of the setting. No "In this picture / I see / The photo shows". Do not invent who holds an object. Do not read text off signs. Stay inside passage_sentence_target (max ~3 short sentences).
last_session_score < 70 → name each target twice, simple words.
explanation: max 8 words.
Audio must not say "as you can see".

OUTPUT fields: audio_script, topic, context, questions[]. Include every OUTPUT SCHEMA key.
Tap items: type image_object_tap, exactly 3 options from image_tags (1 correct + 2 other tags), target_label, correct index, explanation.
Argue items: type image_yes_no, question (required claim sentence), correct_answer agree|disagree, target_label, explanation.
`.trim();
