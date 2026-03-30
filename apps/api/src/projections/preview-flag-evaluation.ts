import {
  type CompiledEnvironmentProjection,
  type EvaluationContext,
  type EvaluationResult,
  evaluateFlag,
} from "@feature-flag-platform/evaluation-core";

export type PreviewFlagEvaluationDependencies = {
  readProjection: (environmentId: string) => Promise<CompiledEnvironmentProjection | null>;
};

export type PreviewFlagEvaluationResult =
  | {
      result: EvaluationResult;
      status: "ok";
    }
  | {
      status: "projection_not_found";
    };

export async function previewFlagEvaluation(
  dependencies: PreviewFlagEvaluationDependencies,
  input: {
    context: EvaluationContext;
    environmentId: string;
    flagKey: string;
  },
): Promise<PreviewFlagEvaluationResult> {
  const projection = await dependencies.readProjection(input.environmentId);

  if (!projection) {
    return {
      status: "projection_not_found",
    };
  }

  return {
    result: evaluateFlag(projection, input.flagKey, input.context),
    status: "ok",
  };
}
