import { reflectionAnalysisActionSchema } from "@/server/agent/reflectAnalyze";
import { orchestratePlanning, type OrchestratedPlan } from "@/server/agent/orchestrate";
import type { ProviderCtx, ProviderStubs } from "@/server/providers";
import type { PlaceHoursRule, SpotOpeningHours } from "@/server/providers/placeFacts";
import { assertExpected } from "./assert";
import { computeMetrics, observeOutcome, type EvalMetrics, type ObservedOutcome } from "./metrics";
import type { EvalScenario } from "./schema";
import { defaultPlanningInput, seedPlanningWorld, seedReplanWorld } from "./world";

export type ScenarioResult = {
  id: string;
  family: string;
  status: "pass" | "fail" | "skip";
  skipReason?: string;
  observed?: ObservedOutcome;
  metrics?: EvalMetrics;
  failures?: string[];
  error?: string;
};

function countProviders(): {
  byProvider: Record<string, number>;
  bump: (provider: string) => void;
} {
  const byProvider: Record<string, number> = {};
  return {
    byProvider,
    bump: (provider: string) => {
      byProvider[provider] = (byProvider[provider] ?? 0) + 1;
    },
  };
}

function asPlaceHours(
  raw: Record<string, unknown> | undefined,
): Record<string, SpotOpeningHours | PlaceHoursRule[]> | undefined {
  if (!raw) return undefined;
  return raw as Record<string, SpotOpeningHours | PlaceHoursRule[]>;
}

function providerStubsFromScenario(scenario: EvalScenario): ProviderStubs | undefined {
  const places = scenario.stubs?.places;
  const routes = scenario.stubs?.routes;
  if (!places && !routes) return undefined;
  return {
    places: places ? { fail: places.fail, empty: places.empty } : undefined,
    routes: routes ? { fail: routes.fail } : undefined,
  };
}

function buildCtx(args: {
  runId: string;
  overlays: ProviderCtx["overlays"];
  scenario: EvalScenario;
  onHttp: ProviderCtx["onHttp"];
}): ProviderCtx {
  return {
    runId: args.runId,
    overlays: args.overlays,
    cache: new Map(),
    httpAttempts: 0,
    onHttp: args.onHttp,
    placeHours: asPlaceHours(args.scenario.stubs?.placeHours),
    stubs: providerStubsFromScenario(args.scenario),
  };
}

async function runReflectSchema(scenario: EvalScenario): Promise<ScenarioResult> {
  const started = Date.now();
  const payload = scenario.stubs?.llmReflect;
  const parsed = reflectionAnalysisActionSchema.safeParse(payload);
  const observed: ObservedOutcome = {
    outcome: parsed.success ? "PLAN" : "FAILED",
    questionId: null,
    issueCodes: parsed.success ? [] : ["LLM_BAD_JSON"],
    validationState: null,
  };
  const metrics = computeMetrics({
    observed,
    expected: scenario.expected,
    apiCallsByProvider: {},
    latencyMs: Date.now() - started,
    cost: { llmJpy: 0, llmUsd: 0, apiJpy: 0 },
  });
  const asserted = assertExpected(scenario.expected, observed, metrics);
  return {
    id: scenario.id,
    family: scenario.family,
    status: asserted.pass ? "pass" : "fail",
    observed,
    metrics,
    failures: asserted.failures,
  };
}

async function orchestrateOnce(args: {
  world: Awaited<ReturnType<typeof seedPlanningWorld>>;
  scenario: EvalScenario;
  counters: ReturnType<typeof countProviders>;
}): Promise<OrchestratedPlan> {
  const ctx = buildCtx({
    runId: args.world.runId,
    overlays: args.world.overlays,
    scenario: args.scenario,
    onHttp: async (info) => {
      args.counters.bump(info.provider);
    },
  });
  return orchestratePlanning({
    runId: args.world.runId,
    ctx,
    log: async () => undefined,
    signal: AbortSignal.timeout(55_000),
    couple: args.world.couple,
    session: args.world.session,
    run: args.world.run,
    memories: [],
  });
}

export async function runScenario(scenario: EvalScenario): Promise<ScenarioResult> {
  if (scenario.skip) {
    return {
      id: scenario.id,
      family: scenario.family,
      status: "skip",
      skipReason: scenario.skipReason ?? "skipped",
    };
  }

  if ((scenario.path ?? "orchestrate") === "reflect_schema") {
    return runReflectSchema(scenario);
  }

  if (!scenario.input) {
    return {
      id: scenario.id,
      family: scenario.family,
      status: "fail",
      failures: ["scenario.input is required for orchestrate path"],
    };
  }

  const counters = countProviders();
  const input = defaultPlanningInput(scenario.input);
  let result: OrchestratedPlan | null = null;
  let error: string | undefined;
  const started = Date.now();

  try {
    let world = await seedPlanningWorld({
      input,
      overlaySpecs: scenario.overlays,
    });

    if (scenario.replan) {
      const initial = await orchestrateOnce({ world, scenario, counters });
      if (!initial.built) {
        throw new Error(
          `replan seed failed: INITIAL_PLAN waiting=${initial.waitingQuestion?.id ?? "none"}`,
        );
      }
      const targetFirst = scenario.replan.targetFirstItem !== false;
      const targetPlanItemId = targetFirst ? (initial.built.plan.items[0]?.id ?? null) : null;
      world = await seedReplanWorld({
        world,
        plan: initial.built.plan,
        spots: initial.built.spots,
        instruction: scenario.replan.instruction,
        targetPlanItemId,
      });
    }

    result = await orchestrateOnce({ world, scenario, counters });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const latencyMs = Date.now() - started;
  const observed = observeOutcome(result, Boolean(error));
  const metrics = computeMetrics({
    observed,
    expected: scenario.expected,
    apiCallsByProvider: counters.byProvider,
    latencyMs,
    cost: {
      llmJpy: result?.llm.costJpy ?? 0,
      llmUsd: result?.llm.costUsd ?? 0,
      apiJpy: 0,
    },
  });

  const asserted = assertExpected(scenario.expected, observed, metrics);
  if (error) {
    asserted.failures.push(`threw: ${error}`);
    asserted.pass = false;
  }

  return {
    id: scenario.id,
    family: scenario.family,
    status: asserted.pass ? "pass" : "fail",
    observed,
    metrics,
    failures: asserted.failures,
    error,
  };
}
