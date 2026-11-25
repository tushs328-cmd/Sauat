export function sameIds(left = [], right = []) {
  return left.length === right.length && [...left].sort().every((id, index) => id === [...right].sort()[index]);
}

export function evaluateTask(task, selectedOptionIds, selectedEvidenceIds) {
  const answerCorrect = sameIds(selectedOptionIds, task.correctOptionIds);
  const evidenceCorrect = !task.requireEvidence || task.acceptedEvidenceSets.some((set) => sameIds(selectedEvidenceIds, set));
  return { answerCorrect, evidenceCorrect, complete: answerCorrect && evidenceCorrect };
}

export function nextHint(task, usedCount) {
  return task.hints.find((hint) => hint.level === Math.min(usedCount + 1, 3)) || null;
}

export function taskLabel(task, copy) {
  const labels = { infer_evidence: copy.infer, claim_check: copy.claim_check, find: copy.find };
  return labels[task.type] || copy.task;
}
