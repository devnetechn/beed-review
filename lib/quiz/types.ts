export type QuizQuestionForTaking = {
  id: string;
  question: string;
  choices: string[];
};

export type QuizQuestionReview = QuizQuestionForTaking & {
  correct_answer: string;
  selected_answer: string | null;
  explanation: string;
};

export type QuizAttemptView =
  | {
      scored: false;
      attemptId: string;
      label: string;
      totalQuestions: number;
      questions: QuizQuestionForTaking[];
    }
  | {
      scored: true;
      attemptId: string;
      label: string;
      score: number;
      totalQuestions: number;
      questions: QuizQuestionReview[];
    };

export type WeakTopic = {
  topicId: string;
  topicName: string;
  subjectName: string;
  accuracy: number;
  totalQuestions: number;
};
