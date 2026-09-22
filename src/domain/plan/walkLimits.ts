import { WALK_LIMITS } from "@/config/settings";
import { ANSWER, choice, type WaitingOption } from "@/contracts/waitingChoice";
import type { Memory, Plan, Session, TravelLeg, TravelMode, WalkLongAck } from "@/domain/schemas";

export type WalkOverageLeg = {
  id?: string;
  key: string;
  from: TravelLeg["from"];
  to: TravelLeg["to"];
  fromSpotId: string | null;
  toSpotId: string | null;
  minutes: number;
};

export type WalkLimitResult = {
  applies: boolean;
  longestLegMinutes: number;
  totalMinutes: number;
  /** 合計がソフト目安を超えている（表示用。これだけでは exceeds にしない） */
  softTotalExceeded: boolean;
  overLeg: boolean;
  /** 明示ハード上限があるときだけ意味を持つ */
  overTotal: boolean;
  exceeds: boolean;
  overLegIds: string[];
  overLegs: WalkOverageLeg[];
  endOver: boolean;
  hardTotalMinutes: number | null;
  softTotalMinutes: number;
  unknownWalkPortion: boolean;
};

/** Cache/display jitter must not by itself revoke a session consent. */
export const WALK_ACK_SLACK_MINUTES = 2;

export type AcknowledgedLongLeg = {
  key: string;
  minutes: number;
};

export type WalkAckScope = {
  dateTokyo: string;
  travelMode: string;
  meetSpotId: string | null;
  endSpotId: string | null;
  routeSpotIds: string[];
  longestLegMinutes: number;
  totalMinutes: number;
  acknowledgedLongLegs: AcknowledgedLongLeg[];
};

export function walkLegKey(
  leg: Pick<TravelLeg, "from" | "to" | "fromSpotId" | "toSpotId"> | WalkOverageLeg,
): string {
  return `${leg.from}:${leg.fromSpotId ?? ""}->${leg.to}:${leg.toSpotId ?? ""}`;
}

export function legLabel(
  leg: Pick<TravelLeg, "from" | "to" | "fromSpotId" | "toSpotId">,
  spots: Record<string, { name?: string }> = {},
  endpoints?: { meetName?: string; endName?: string },
): string {
  const nameOf = (spotId: string | null | undefined, fallback: string) =>
    (spotId && spots[spotId]?.name) || fallback;
  if (leg.from === "MEET") {
    const meet = endpoints?.meetName ?? "集合";
    return `${meet}から${nameOf(leg.toSpotId, "最初のスポット")}`;
  }
  if (leg.to === "END") {
    const end = endpoints?.endName ?? "解散";
    return `${nameOf(leg.fromSpotId, "最後のスポット")}から${end}`;
  }
  return `${nameOf(leg.fromSpotId, "区間")}から${nameOf(leg.toSpotId, "次")}`;
}

/**
 * 区間の徒歩分数。WALK は duration 全体。TRANSIT は内訳のみ（乗車は数えない）。
 * 内訳未取得は null（0分扱いにしない）。
 */
export function walkMinutesOfLeg(
  leg: Pick<TravelLeg, "mode" | "durationMinutes"> & {
    walkMinutesWithin?: { value: number | null } | null;
  },
): number | null {
  if (leg.mode === "WALK") return leg.durationMinutes.value;
  if (leg.mode === "TRANSIT") {
    if (!leg.walkMinutesWithin) return null;
    return leg.walkMinutesWithin.value;
  }
  return 0;
}

/** 記憶から明示的な総徒歩上限を読む。HARD + WALK_HARD_CAP のみ強制。本文 regex は使わない。 */
export function resolveWalkHardTotal(memories: Memory[] = []): {
  minutes: number | null;
  memoryIds: string[];
} {
  let best: number | null = null;
  const memoryIds: string[] = [];
  for (const memory of memories) {
    if (!memory.active) continue;
    if (memory.strength !== "HARD") continue;
    for (const d of memory.planDirectives ?? []) {
      if (d.kind !== "WALK_HARD_CAP") continue;
      const n = d.walkHardCapMinutes;
      if (n == null || !Number.isFinite(n) || n <= 0 || n > 600) continue;
      best = best == null ? n : Math.min(best, n);
      memoryIds.push(memory.id);
    }
  }
  return { minutes: best, memoryIds: [...new Set(memoryIds)] };
}

export type WalkLimitOptions = {
  legMinutes?: number;
  softTotalMinutes?: number;
  hardTotalMinutes?: number | null;
  /** false のとき区間超過では止めない（TRANSIT 許可後など） */
  enforcePerLeg?: boolean;
};

export function evaluateWalkLimits(
  mode: TravelMode,
  legs: Array<
    Pick<TravelLeg, "mode" | "durationMinutes"> &
      Partial<Pick<TravelLeg, "id" | "from" | "to" | "fromSpotId" | "toSpotId" | "walkMinutesWithin">>
  >,
  options: WalkLimitOptions = {},
): WalkLimitResult {
  const legMinutes = options.legMinutes ?? WALK_LIMITS.legMinutes;
  const softTotalMinutes = options.softTotalMinutes ?? WALK_LIMITS.softTotalMinutes;
  const hardTotal =
    options.hardTotalMinutes !== undefined
      ? options.hardTotalMinutes
      : WALK_LIMITS.hardTotalMinutes;
  const enforcePerLeg = options.enforcePerLeg ?? mode === "WALK";

  const walkParts = legs.map((leg) => {
    const minutes = walkMinutesOfLeg(leg);
    return { leg, minutes };
  });
  const known = walkParts.filter(
    (row): row is { leg: (typeof legs)[number]; minutes: number } =>
      row.minutes != null && row.minutes > 0,
  );
  const unknownWalkPortion = walkParts.some(
    (row) => row.leg.mode === "TRANSIT" && row.minutes == null,
  );
  // 合計は徒歩部分のみ（TRANSIT 乗車は walkMinutesOfLeg で除外）
  const longestLegMinutes = known.length ? Math.max(...known.map((row) => row.minutes)) : 0;
  const totalMinutes = known.reduce((sum, row) => sum + row.minutes, 0);
  // 区間強制確認の対象は WALK 区間のみ
  const resolvedOverLegs: WalkOverageLeg[] = known
    .filter((row) => row.leg.mode === "WALK" && row.minutes > legMinutes)
    .map((row) => ({
      id: row.leg.id,
      key: walkLegKey({
        from: row.leg.from ?? "SPOT",
        to: row.leg.to ?? "SPOT",
        fromSpotId: row.leg.fromSpotId ?? null,
        toSpotId: row.leg.toSpotId ?? null,
      }),
      from: row.leg.from ?? "SPOT",
      to: row.leg.to ?? "SPOT",
      fromSpotId: row.leg.fromSpotId ?? null,
      toSpotId: row.leg.toSpotId ?? null,
      minutes: row.minutes,
    }));
  const overLegIds = resolvedOverLegs.map((leg) => leg.id).filter((id): id is string => Boolean(id));
  const endLeg = legs.find((leg) => leg.to === "END" && leg.mode === "WALK");
  const endMinutes = endLeg ? walkMinutesOfLeg(endLeg) : null;
  const endOver = endMinutes != null && endMinutes > legMinutes;
  const overLeg = resolvedOverLegs.length > 0;
  const overTotal = hardTotal != null && totalMinutes > hardTotal;
  const softTotalExceeded = totalMinutes > softTotalMinutes;
  const applies = enforcePerLeg || hardTotal != null;
  const exceeds =
    applies && known.length > 0 && ((enforcePerLeg && overLeg) || overTotal);

  return {
    applies,
    longestLegMinutes,
    totalMinutes,
    softTotalExceeded,
    overLeg,
    overTotal,
    overLegIds,
    overLegs: resolvedOverLegs,
    endOver,
    hardTotalMinutes: hardTotal,
    softTotalMinutes,
    unknownWalkPortion,
    exceeds,
  };
}

/** 徒歩上限超過の区間説明。「候補なし」とは別メッセージにする素材。 */
export function describeWalkOverages(
  result: WalkLimitResult,
  legs: Array<
    Pick<TravelLeg, "id" | "mode" | "durationMinutes" | "from" | "to" | "fromSpotId" | "toSpotId"> & {
      walkMinutesWithin?: { value: number | null };
    }
  >,
  spots: Record<string, { name?: string }> = {},
  endpoints?: { meetName?: string; endName?: string },
  limits: { legMinutes: number } = { legMinutes: WALK_LIMITS.legMinutes },
): string[] {
  const details: string[] = [];
  const source = result.overLegs.length
    ? result.overLegs
    : legs
        .filter((leg) => leg.mode === "WALK")
        .map((leg) => {
          const minutes = walkMinutesOfLeg(leg);
          if (minutes == null || minutes <= limits.legMinutes) return null;
          return {
            key: walkLegKey(leg),
            from: leg.from,
            to: leg.to,
            fromSpotId: leg.fromSpotId,
            toSpotId: leg.toSpotId,
            minutes,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row != null);

  for (const leg of source) {
    details.push(`${legLabel(leg, spots, endpoints)}まで徒歩${leg.minutes}分`);
  }
  if (result.overTotal && result.hardTotalMinutes != null) {
    details.push(
      `総徒歩上限 ${result.hardTotalMinutes}分に対し合計 ${result.totalMinutes}分`,
    );
  }
  return details;
}

export function encodeWalkAckScope(scope: WalkAckScope): string {
  return JSON.stringify({
    dateTokyo: scope.dateTokyo,
    travelMode: scope.travelMode,
    meetSpotId: scope.meetSpotId ?? "",
    endSpotId: scope.endSpotId ?? "",
    routeSpotIds: scope.routeSpotIds,
    longestLegMinutes: scope.longestLegMinutes,
    totalMinutes: scope.totalMinutes,
    acknowledgedLongLegs: scope.acknowledgedLongLegs,
  });
}

export function parseWalkAckScope(raw: string | null | undefined): WalkAckScope | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WalkAckScope> & { spotIds?: string[] };
    if (parsed && typeof parsed.dateTokyo === "string") {
      return {
        dateTokyo: parsed.dateTokyo,
        travelMode: String(parsed.travelMode ?? ""),
        meetSpotId: parsed.meetSpotId ? String(parsed.meetSpotId) : null,
        endSpotId: parsed.endSpotId ? String(parsed.endSpotId) : null,
        routeSpotIds: Array.isArray(parsed.routeSpotIds)
          ? parsed.routeSpotIds.map(String)
          : Array.isArray(parsed.spotIds)
            ? parsed.spotIds.map(String)
            : [],
        longestLegMinutes: Number(parsed.longestLegMinutes) || 0,
        totalMinutes: Number(parsed.totalMinutes) || 0,
        acknowledgedLongLegs: Array.isArray(parsed.acknowledgedLongLegs)
          ? parsed.acknowledgedLongLegs
              .map((row) => ({
                key: String(row.key ?? ""),
                minutes: Number(row.minutes) || 0,
              }))
              .filter((row) => row.key)
          : [],
      };
    }
  } catch {
    // Fall through to the previous pipe encoding.
  }
  const parts = raw.split("|");
  if (parts.length >= 4 && /^\d{4}-\d{2}-\d{2}$/.test(parts[0])) {
    return {
      dateTokyo: parts[0],
      travelMode: parts[1],
      meetSpotId: parts[2] || null,
      endSpotId: parts[3] || null,
      routeSpotIds: parts[4] ? parts[4].split(",").filter(Boolean) : [],
      longestLegMinutes: Number(parts[5]) || 0,
      totalMinutes: Number(parts[6]) || 0,
      acknowledgedLongLegs: [],
    };
  }
  return null;
}

export function walkAckFingerprint(input: {
  dateTokyo: string;
  travelMode: string;
  meetSpotId: string | null;
  endSpotId: string | null;
  spotIds: string[];
  longestLegMinutes: number;
  totalMinutes: number;
  acknowledgedLongLegs?: AcknowledgedLongLeg[];
}): string {
  return encodeWalkAckScope({
    dateTokyo: input.dateTokyo,
    travelMode: input.travelMode,
    meetSpotId: input.meetSpotId,
    endSpotId: input.endSpotId,
    routeSpotIds: input.spotIds,
    longestLegMinutes: input.longestLegMinutes,
    totalMinutes: input.totalMinutes,
    acknowledgedLongLegs: input.acknowledgedLongLegs ?? [],
  });
}

export function walkAckFingerprintFromPlan(
  session: Pick<Session, "input">,
  plan: Pick<Plan, "items">,
  limits: WalkLimitResult,
): string {
  return walkAckFingerprint({
    dateTokyo: session.input.dateTokyo,
    travelMode: session.input.travelMode,
    meetSpotId: session.input.meet.spotId,
    endSpotId: session.input.end.spotId,
    spotIds: plan.items.map((item) => item.spotId),
    longestLegMinutes: limits.longestLegMinutes,
    totalMinutes: limits.totalMinutes,
    acknowledgedLongLegs: limits.overLegs.map((leg) => ({
      key: leg.key,
      minutes: leg.minutes,
    })),
  });
}

export function walkAckScopeFromAck(ack: WalkLongAck | null | undefined): WalkAckScope | null {
  if (!ack) return null;
  if (ack.dateTokyo) {
    return {
      dateTokyo: ack.dateTokyo,
      travelMode: ack.travelMode ?? "",
      meetSpotId: ack.meetSpotId ?? null,
      endSpotId: ack.endSpotId ?? null,
      routeSpotIds: ack.routeSpotIds ?? [],
      longestLegMinutes: ack.longestLegMinutes ?? 0,
      totalMinutes: ack.totalMinutes ?? 0,
      acknowledgedLongLegs: ack.acknowledgedLongLegs ?? [],
    };
  }
  return parseWalkAckScope(ack.fingerprint);
}

export function walkLongAckCovers(
  ack: WalkLongAck | null | undefined,
  current: WalkAckScope,
  opts?: { hardTotalMinutes?: number | null },
): boolean {
  const acked = walkAckScopeFromAck(ack);
  if (!acked) return false;
  if (acked.dateTokyo !== current.dateTokyo) return false;
  if (acked.travelMode !== current.travelMode) return false;
  if ((acked.meetSpotId ?? "") !== (current.meetSpotId ?? "")) return false;
  if ((acked.endSpotId ?? "") !== (current.endSpotId ?? "")) return false;

  const hardTotal = opts?.hardTotalMinutes ?? WALK_LIMITS.hardTotalMinutes;
  if (hardTotal != null) {
    if (current.totalMinutes > acked.totalMinutes + WALK_ACK_SLACK_MINUTES) return false;
  }

  // Legacy fingerprints without long-leg list: fall back to longest-leg ceiling.
  if (!acked.acknowledgedLongLegs.length) {
    return current.longestLegMinutes <= acked.longestLegMinutes + WALK_ACK_SLACK_MINUTES;
  }

  // Every current long leg must be covered by a previously acknowledged one.
  for (const leg of current.acknowledgedLongLegs) {
    const prior = acked.acknowledgedLongLegs.find((row) => row.key === leg.key);
    if (!prior) return false;
    if (leg.minutes > prior.minutes + WALK_ACK_SLACK_MINUTES) return false;
  }
  return true;
}

export function walkLongAckMatches(
  ack: WalkLongAck | null | undefined,
  fingerprint: string,
  opts?: { hardTotalMinutes?: number | null },
): boolean {
  const current = parseWalkAckScope(fingerprint);
  if (!current) return false;
  return walkLongAckCovers(ack, current, opts);
}

/** @deprecated Prefer walkLongAckMatches. Global flags and memories are not session consent. */
export function walkLongAcknowledged(input: {
  walkLongAcknowledged?: boolean;
  fingerprint?: string;
  ack?: WalkLongAck | null;
}): boolean {
  if (input.fingerprint) return walkLongAckMatches(input.ack, input.fingerprint);
  return false;
}

export function longWalkQuestion(
  result: WalkLimitResult,
  details: string[] = [],
  spots: Record<string, { name?: string }> = {},
  endpoints?: { meetName?: string; endName?: string },
): {
  id: "q_long_walk";
  prompt: string;
  options: WaitingOption[];
} {
  const options = [
    choice(ANSWER.use_transit, "公共交通を使う"),
    choice(ANSWER.change_endpoints, "解散場所を変える"),
    choice(ANSWER.continue_walk, "このまま徒歩で続ける"),
    choice(ANSWER.abort, "中断する"),
  ];

  if (result.overTotal && result.hardTotalMinutes != null && !result.overLeg) {
    return {
      id: "q_long_walk",
      prompt: `承認された総徒歩上限（${result.hardTotalMinutes}分）を、いまの行程の徒歩合計 ${result.totalMinutes}分が超えています。公共交通を使う、解散場所を変える、このまま徒歩で続ける、から選んでください。`,
      options,
    };
  }

  const over = result.overLegs;
  if (over.length === 1) {
    const leg = over[0];
    const label = details[0] ?? `${legLabel(leg, spots, endpoints)}まで徒歩${leg.minutes}分`;
    const cleaned = label.replace(/です$/, "");
    return {
      id: "q_long_walk",
      prompt: `${cleaned}です。この区間で公共交通を使いますか？解散場所を変える、このまま徒歩で続ける、も選べます。`,
      options,
    };
  }

  if (over.length > 1) {
    const list =
      details.length > 0
        ? details.join("、")
        : over.map((leg) => `${legLabel(leg, spots, endpoints)} ${leg.minutes}分`).join("、");
    return {
      id: "q_long_walk",
      prompt: `次の区間が徒歩の確認目安（${WALK_LIMITS.legMinutes}分）を超えています（${list}）。長い区間だけ公共交通を使えます。公共交通を使う、解散場所を変える、このまま徒歩で続ける、から選んでください。`,
      options,
    };
  }

  return {
    id: "q_long_walk",
    prompt: `徒歩が長い区間があります。公共交通を使う、解散場所を変える、このまま徒歩で続ける、から選んでください。`,
    options,
  };
}

export function travelUnverifiedQuestion(unknownCount: number): {
  id: "q_travel_unverified";
  prompt: string;
  options: WaitingOption[];
} {
  return {
    id: "q_travel_unverified",
    prompt: `店舗候補はありますが、必須の移動 ${unknownCount} 区間を確認できていません。直線距離では代用していません。移動を確認できていない暫定案として表示しています。通常の確定はできません。経路を再取得する、近場の候補で組み直す、集合・解散を変える、から選んでください。`,
    options: [
      choice(ANSWER.retry_routes, "経路を再取得する"),
      choice(ANSWER.shrink_search, "近場の候補で組み直す"),
      choice(ANSWER.change_conditions, "集合・解散を変える"),
      choice(ANSWER.abort, "中断する"),
    ],
  };
}

export function hasUnverifiedTravel(issues: { code: string }[]): boolean {
  return issues.some((i) => i.code === "TRAVEL_UNKNOWN" || i.code === "END_TRAVEL_UNKNOWN");
}
