// Client-side Series 65 metadata — the *non-copyright* bits only. The 400
// question stems, their explanations, and the vocabulary deck live on the server
// (apps/api/src/studies/series65/*) and are fetched, team-gated, through
// useSeries65Bank. What stays here is just the type/topic shape and a couple of
// display counts, none of which is the licensed content itself.
//
// Keep the topic union + order in step with apps/api/src/studies/series65/bank.ts.

export type Series65Topic =
  | 'Economics'
  | 'Regulations & Ethics'
  | 'Investments'
  | 'Client Management';

export const SERIES65_TOPICS: Series65Topic[] = [
  'Economics',
  'Regulations & Ethics',
  'Investments',
  'Client Management',
];

export interface Series65Question {
  id: number;
  topic: Series65Topic;
  stem: string;
  options: { label: 'A' | 'B' | 'C' | 'D'; text: string }[];
  answer: 'A' | 'B' | 'C' | 'D';
}

export interface VocabCard {
  term: string;
  def: string;
  topic: Series65Topic;
}

// Headline counts shown on the Study Hub card. These are just numbers for
// display — no licensed content — so they can safely ship in the bundle. Keep
// them roughly in step with the server bank (exact precision is not important).
export const SERIES65_QUESTION_COUNT = 400;
export const SERIES65_VOCAB_COUNT = 116;
