export type VectorScore = {
  jobId: string;
  score: number;
};

export type CommonWords = {
  jobId: string;
  text: string;
};

export type SuggestionChanges = {
  changeFrom: string;
  changeTo: string;
};

export type Suggestion = {
  jobId: string;
  changes: SuggestionChanges[];
};

export type ResumeProcessorResponse = {
  vectorScoresSet: VectorScore[];
  commonWordsSet: CommonWords[];
  suggestionsSet: Suggestion[];
};
