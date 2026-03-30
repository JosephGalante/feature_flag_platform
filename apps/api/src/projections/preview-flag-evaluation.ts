import {
  type CompiledEnvironmentProjection,
  type EvaluationBatchResult,
  type EvaluationContext,
  type EvaluationResult,
  evaluateFlag,
  evaluateFlags,
} from "@feature-flag-platform/evaluation-core";

type PreviewFlagEvaluationDependencies = {
  readProjection: (environmentId: string) => Promise<CompiledEnvironmentProjection | null>;
};

type PreviewFlagEvaluationResult =
  | {
      result: EvaluationResult;
      status: "ok";
    }
  | {
      status: "projection_not_found";
    };

type PreviewFlagBatchEvaluationResult =
  | {
      result: EvaluationBatchResult;
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

export async function previewFlagBatchEvaluation(
  dependencies: PreviewFlagEvaluationDependencies,
  input: {
    context: EvaluationContext;
    environmentId: string;
    flagKeys: ReadonlyArray<string>;
  },
): Promise<PreviewFlagBatchEvaluationResult> {
  const projection = await dependencies.readProjection(input.environmentId);

  if (!projection) {
    return {
      status: "projection_not_found",
    };
  }

  return {
    result: evaluateFlags(projection, input.flagKeys, input.context),
    status: "ok",
  };
}
