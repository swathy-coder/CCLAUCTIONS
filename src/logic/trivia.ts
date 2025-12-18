// Trivia module logic (placeholder)
export function getTriviaQuestion() {
  // Return a random trivia question
  return {
    question: 'Who won the first CCL auction?',
    options: ['Team A', 'Team B', 'Team C', 'Team D'],
    answer: 0
  };
}

export function checkTriviaAnswer(question: any, selected: number) {
  return question.answer === selected;
}
