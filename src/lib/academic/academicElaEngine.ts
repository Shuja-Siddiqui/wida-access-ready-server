/**
 * Academic ELA (English Language Arts) Listening Engine
 *
 * Selects ELA units, genres, scenarios, and vocabulary for the listening_academic tier.
 * Complements the math/science/social-studies engines for the ELA subject rotation.
 *
 * Design decisions:
 *  - Four genres: narrative, informational, argument, author_craft
 *  - Each unit maps to a primary genre but can rotate genres across sessions
 *  - Tier-3 vocabulary is literary/textual terminology, stratified by WIDA level (3-6)
 *  - Permitted formats: all four (multiple_choice, sequence_ordering, pair_matching, agree_disagree)
 *    agree_disagree works well for claims about author intent, character motivation, and argument texts
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ElaGenre = "narrative" | "informational" | "argument" | "author_craft";

export interface ElaUnit {
  id:           string;
  unit:         string;
  primaryGenre: ElaGenre;
  /** Additional genres this unit naturally supports */
  altGenres:    ElaGenre[];
  tier3ByLevel: Record<string, string[]>;
  scenarios:    string[];
}

export interface ElaSessionContext {
  unit:             string;
  genre:            ElaGenre;
  scenario:         string;
  tier3Vocabulary:  string[];
  topicLabel:       string;
  permittedFormats: string[];
}

// ── Permitted formats ─────────────────────────────────────────────────────────

export const ELA_PERMITTED_FORMATS: string[] = [
  "multiple_choice",
  "sequence_ordering",
  "pair_matching",
  "agree_disagree",
];

// ── Curriculum data ───────────────────────────────────────────────────────────

const ELA_UNITS: ElaUnit[] = [
  {
    id: "narrative-structure",
    unit: "Narrative Structure",
    primaryGenre: "narrative",
    altGenres: ["author_craft"],
    tier3ByLevel: {
      "3": ["character", "setting", "conflict", "resolution", "plot"],
      "4": ["protagonist", "antagonist", "rising action", "climax", "falling action"],
      "5": ["dynamic character", "static character", "internal conflict", "external conflict", "narrative arc"],
      "6": ["characterization", "narrative perspective", "foil", "subplot", "denouement"],
    },
    scenarios: [
      "a student who overcomes stage fright before a school performance",
      "a new student adjusting to a different country and culture",
      "two friends who must resolve a misunderstanding",
      "a young person who discovers a talent they did not know they had",
      "a character who must make a difficult choice between loyalty and honesty",
    ],
  },
  {
    id: "informational-text",
    unit: "Informational Text Structure",
    primaryGenre: "informational",
    altGenres: ["argument"],
    tier3ByLevel: {
      "3": ["main idea", "detail", "heading", "topic sentence", "conclusion"],
      "4": ["text structure", "cause and effect", "compare and contrast", "problem and solution", "chronological order"],
      "5": ["central idea", "supporting evidence", "inference", "summary", "author's purpose"],
      "6": ["synthesis", "corroboration", "domain-specific vocabulary", "text feature", "implicit meaning"],
    },
    scenarios: [
      "how schools in different countries operate differently",
      "the history and science of why seasons change",
      "how social media affects young people's mental health",
      "the process of how laws are made in a democracy",
      "why sleep is essential for learning and memory",
    ],
  },
  {
    id: "argument-writing",
    unit: "Argument and Opinion",
    primaryGenre: "argument",
    altGenres: ["informational"],
    tier3ByLevel: {
      "3": ["opinion", "reason", "example", "claim", "agree"],
      "4": ["argument", "evidence", "counterclaim", "persuade", "support"],
      "5": ["claim", "reasoning", "rebuttal", "credibility", "logical fallacy"],
      "6": ["rhetorical appeal", "ethos", "pathos", "logos", "concession"],
    },
    scenarios: [
      "whether schools should allow students to use smartphones in class",
      "whether student athletes should be required to maintain a minimum GPA",
      "whether zoos are beneficial or harmful to animals",
      "whether homework helps or hurts student learning",
      "whether schools should start later in the morning",
    ],
  },
  {
    id: "authors-craft",
    unit: "Author's Craft",
    primaryGenre: "author_craft",
    altGenres: ["narrative", "informational"],
    tier3ByLevel: {
      "3": ["simile", "metaphor", "repetition", "rhyme", "imagery"],
      "4": ["figurative language", "personification", "alliteration", "tone", "word choice"],
      "5": ["symbolism", "irony", "foreshadowing", "flashback", "point of view"],
      "6": ["narrative voice", "diction", "connotation", "denotation", "literary device"],
    },
    scenarios: [
      "a short poem about seasons and change read with analysis of figurative language",
      "a memoir excerpt about a family tradition and the author's use of sensory details",
      "a passage where the author's word choice creates a suspenseful mood",
      "a narrative excerpt that uses flashback to reveal a character's motivation",
      "a descriptive passage where personification makes nature come alive",
    ],
  },
  {
    id: "poetry",
    unit: "Poetry and Verse",
    primaryGenre: "author_craft",
    altGenres: ["narrative"],
    tier3ByLevel: {
      "3": ["rhyme", "rhythm", "stanza", "line", "verse"],
      "4": ["meter", "free verse", "imagery", "repetition", "theme"],
      "5": ["speaker", "enjambment", "allusion", "extended metaphor", "tone"],
      "6": ["volta", "apostrophe", "anaphora", "assonance", "consonance"],
    },
    scenarios: [
      "a short poem about belonging and identity read aloud with discussion of imagery",
      "a poem about the natural world using vivid personification",
      "a narrative poem telling the story of a historical event",
      "a free-verse poem about change and growth with discussion of structure",
      "a poem using extended metaphor to describe a life challenge",
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampLevel(level: number): number {
  return Math.min(6, Math.max(3, Math.floor(level)));
}

export function getElaVocabForLevel(unit: ElaUnit, wida: number): string[] {
  const key = String(clampLevel(wida));
  return unit.tier3ByLevel[key] ?? unit.tier3ByLevel["3"] ?? [];
}

/**
 * Selects an ELA unit and scenario for the session.
 * Rotates units to avoid repetition, picks a scenario within the chosen unit.
 */
export function selectElaScenario(
  persistedTopic:  string | null,
  topicsUsedToday: string[] = [],
): ElaSessionContext {
  const usedLower = topicsUsedToday.map((t) => t.toLowerCase());

  let chosenUnit: ElaUnit;
  let chosenScenario: string;
  let chosenGenre: ElaGenre;

  if (persistedTopic) {
    const retryUnit = ELA_UNITS.find((u) =>
      u.scenarios.some((s) => persistedTopic.includes(s.slice(0, 40)))
    ) ?? ELA_UNITS[Math.floor(Math.random() * ELA_UNITS.length)];
    chosenUnit = retryUnit;
    const matched = retryUnit.scenarios.find((s) => persistedTopic.includes(s.slice(0, 40)));
    chosenScenario = matched ?? retryUnit.scenarios[Math.floor(Math.random() * retryUnit.scenarios.length)];
    chosenGenre = retryUnit.primaryGenre;
  } else {
    const available = ELA_UNITS.filter(
      (u) => !usedLower.some((used) =>
        u.unit.toLowerCase().includes(used) || used.includes(u.unit.toLowerCase())
      )
    );
    const pool = available.length > 0 ? available : ELA_UNITS;
    chosenUnit = pool[Math.floor(Math.random() * pool.length)];
    chosenScenario = chosenUnit.scenarios[Math.floor(Math.random() * chosenUnit.scenarios.length)];
    // Occasionally use an alt genre for variety
    const allGenres = [chosenUnit.primaryGenre, ...chosenUnit.altGenres];
    chosenGenre = allGenres[Math.floor(Math.random() * allGenres.length)];
  }

  return {
    unit:             chosenUnit.unit,
    genre:            chosenGenre,
    scenario:         chosenScenario,
    tier3Vocabulary:  [], // filled in by buildElaSessionContext
    topicLabel:       `ELA — Grade 6–8: ${chosenUnit.unit}`,
    permittedFormats: ELA_PERMITTED_FORMATS,
  };
}

/**
 * Builds the complete ElaSessionContext for one session,
 * including vocab resolved at the student's current WIDA level.
 */
export function buildElaSessionContext(
  fractionalLevel:  number,
  persistedTopic:   string | null,
  topicsUsedToday:  string[] = [],
): ElaSessionContext {
  const ctx   = selectElaScenario(persistedTopic, topicsUsedToday);
  const unit  = ELA_UNITS.find((u) => u.unit === ctx.unit) ?? ELA_UNITS[0];
  const vocab = getElaVocabForLevel(unit, fractionalLevel);
  return { ...ctx, tier3Vocabulary: vocab };
}
