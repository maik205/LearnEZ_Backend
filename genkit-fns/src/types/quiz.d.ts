import { GenericReference } from "./reference.js";

// Questions and answers should be rendered with Markdown
// (pls use library for this)
// for tabular data support and rendering mathematical equations.
export interface GenericQuestion {
  // Facillitates non-MCQ questions

  maxScore: number;
  minScore: number;
  passingScore: number;
  answer: string;
  question: string;
  level: number;
  reference: GenericReference;
}

export interface MultipleChoiceQuestion extends GenericQuestion {
  choices: {
    a:string,
    b:string,
    c:string,
    d:string
  };
}

export interface Attempt {
  userId: string;
  materialId: string;
  initialQuery: string;
  startedAt: Date;
  endedAt?: Date;
  maxLength?: number;
  questionHistory: QuestionAttempt[];
}

export interface QuestionAttempt {
  question: GenericQuestion;
  userAnswer?: string;
  pointsReceived?: number;
  answeredAt?: Date;
  harderQuestion?: GenericQuestion;
  easierQuestion?: GenericQuestion;
}
