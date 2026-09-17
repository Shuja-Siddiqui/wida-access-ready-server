/** Listening levels 3–6: oral passage + selected response. Not picture taps. Not reading print. */

export const LISTENING_CONTENT_3_6 = `
DOMAIN: LISTENING  |  BAND: 3–6  |  student hears a passage, then answers from the AUDIO

Write audio_script so the skill is clear from listening alone. Match oral_format and passage_sentence_target.
Narrate → chronological story; one main idea. Inform → facts/report; one main idea.
Explain → how/why explicit in the audio.
Argue → a position with stated evidence.
No SSML, symbols, or "as you can see".
Questions: exactly question_count, ONLY formats in OUTPUT SCHEMA. Include every schema key. Each selected-response item has exactly 3 options (1 correct + 2 distractors). Foils are plausible mishearings, not random.
last_session_score < 70 → clearer signals, same skill. is_retry → new speaker/setting, same skill.
explanation: max 8 words.
L3: familiar paragraph, main idea/detail. L4: longer talk, not guesswork. L5: gist/sequence/purpose. L6: inference only if the audio supports it.
`.trim();
