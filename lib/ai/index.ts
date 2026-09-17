export async function summarizeResource(resourceId: string): Promise<never> {
  throw new Error(`Not implemented: summarizeResource("${resourceId}") ships in Phase 3`);
}

export async function generateQuiz(
  resourceId: string,
  count: 5 | 10 | 20 | 50,
  difficulty: "easy" | "medium" | "hard"
): Promise<never> {
  throw new Error(
    `Not implemented: generateQuiz("${resourceId}", ${count}, "${difficulty}") ships in Phase 3/4`
  );
}

export async function tutorChat(conversationId: string, message: string): Promise<never> {
  throw new Error(
    `Not implemented: tutorChat("${conversationId}", "${message}") ships in Phase 3`
  );
}
