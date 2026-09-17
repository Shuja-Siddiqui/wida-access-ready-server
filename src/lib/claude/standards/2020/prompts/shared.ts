/** Shared 2020 rules. The user JSON field `framework` has six parts. Use each part as written below. */

export const FRAMEWORK_2020_PROMPT_SLICE = `
EDITION: WIDA English Language Development Standards Framework, 2020.

The user JSON contains framework. It has six parts. Use them in this order. Do not skip a part. Do not invent a part that is missing.

1. framework.eld_standard
What it is: the school subject world (everyday school language, English language arts, mathematics, science, or social studies).
How to use: every student-facing prompt stays inside this subject world. Do not switch to a different subject.

2. framework.key_language_use
What it is: the language job for this session. Narrate = tell what happened. Inform = give facts. Explain = tell how or why. Argue = make a claim and support it.
How to use: the task must be this job only. Do not turn Inform into Explain. Do not turn Explain into a story.

3. framework.mode
What it is: interpretive = the student takes language in (listen, read, view). expressive = the student puts language out (speak, write).
How to use: follow the mode in the JSON. If mode is expressive, the student must produce language. Do not write a listen-and-choose quiz for an expressive writing call.

4. framework.language_expectations
What it is: the official goal list for this standard + this key language use + this mode. This list is NOT per English level — Level 1 and Level 6 get the same expectations for the same cell.
How to use: the prompt must ask the student to work toward these goals. Do not replace them with a different skill. Do not expect a different expectation list just because the level changed.

5. framework.language_functions and framework.language_functions[].language_features
What they are: language functions = the steps the student must do. language features = the kinds of words and sentence parts that carry out each step (examples in parentheses are samples, not text to copy).
How to use: use only the functions in the JSON. Build one task that practices those steps. Invite the language in the features. If language_features is an empty list, use the function text only (Standard 1 has no features). Do not use name / label / list / point to unless that verb is in the functions. Do not invent extra functions.

6. framework.pld
What it is: five lines for THIS integer English level only (pld.level). organization = order of the text. cohesion = how ideas stick together. density = how much detail is packed in. sentence = how hard the sentences are. word_phrase = how exact the words are. This is what the student's English looks like toward the end of this level.
How to use: these five lines were copied from the PLD JSON for this integer only. They are the only WIDA text that changes by level. Create a task so the student can produce THAT writing — not an easier column, not a harder column. You may use part of a busy picture. Default: no word bank and no fill-in-the-blank. Add help only if this pld cannot be practiced without it. pld is not the topic and not the job. The job stays the functions. Only the English difficulty comes from pld.

If a standard × key language use cell is missing, do not invent it. Stay on the cell in the JSON.
`.trim();
