export interface PlanStep {
  id: number;
  description: string;
  tool?: string;
  result?: string;
  status: "pending" | "running" | "done" | "failed";
}

export interface Plan {
  goal: string;
  steps: PlanStep[];
  createdAt: Date;
}

export function createPlan(goal: string, steps: Omit<PlanStep, "status">[]): Plan {
  return {
    goal,
    steps: steps.map((s) => ({ ...s, status: "pending" })),
    createdAt: new Date(),
  };
}

export function markStepDone(plan: Plan, stepId: number, result: string): void {
  const step = plan.steps.find((s) => s.id === stepId);
  if (step) {
    step.result = result;
    step.status = "done";
  }
}

export function markStepFailed(plan: Plan, stepId: number, error: string): void {
  const step = plan.steps.find((s) => s.id === stepId);
  if (step) {
    step.result = error;
    step.status = "failed";
  }
}

export function getPendingSteps(plan: Plan): PlanStep[] {
  return plan.steps.filter((s) => s.status === "pending");
}

export function getCompletedResults(plan: Plan): string[] {
  return plan.steps.filter((s) => s.status === "done" && s.result).map((s) => s.result!);
}
