"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/client/api";
import { useSession } from "@/client/hooks/use-session";
import { Card } from "@/components/card";
import { CostBadge } from "@/components/cost-badge";
import { ModeBanner, SourceChip } from "@/components/mode-banner";
import { formatTokyoHm } from "@/lib/time";

export function SessionScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { data, error, post, reload } = useSession(sessionId);
  const [draft, setDraft] = useState<string | null>(null);
  const [note, setNote] = useState("カフェは喜んでた。展示は途中で疲れてた");

  const latestRun = data?.runs.at(-1);
  const cost = useMemo(() => {
    const runs = data?.runs ?? [];
    return {
      llm: runs.reduce((n, r) => n + (r.cost.llmJpy ?? 0), 0),
      usd: runs.reduce((n, r) => n + (r.cost.llmUsd ?? 0), 0),
      usdKnown: runs.some((r) => r.cost.llmUsd != null),
      api: runs.reduce((n, r) => n + (r.cost.apiJpy ?? 0), 0),
      hard: runs.reduce((n, r) => n + r.cost.hardCalls, 0),
      mundane: runs.reduce((n, r) => n + r.cost.mundaneCalls, 0),
      unaccounted: runs.reduce((n, r) => n + r.cost.unaccountedCalls, 0),
    };
  }, [data]);

  const pendingApproval = data?.approvals.find((a) => a.status === "PENDING");
  const autoEvent = data?.events.find((e) => e.type === "PLAN_AUTO_APPLIED");


  if (!data) {
    return <main className="p-8 text-ink-soft">{error ?? "読み込み中…"}</main>;
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 pb-28">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-rose">
            ← 条件に戻る
          </Link>
          <h1 className="text-2xl font-semibold">
            {data.session.input.dateTokyo} {data.session.input.meet.name}
          </h1>
          <p className="text-sm text-ink-soft">
            セッション {data.session.status} / 行程 v{data.plan?.version ?? "—"} / 検証 {data.plan?.validation.state ?? "—"}
          </p>
        </div>
        <Link href={`/memory?couple=${data.couple.id}`} className="text-sm underline">
          記憶
        </Link>
      </div>

      <div className="mt-4">
        <ModeBanner
          runtime={data.runtime}
          emulator={data.emulator}
          dataBackend={data.dataBackend}
          authBackend={data.authBackend}
          mode={latestRun?.mode}
          overlays={data.overlays}
        />
      </div>
      {error ? <p className="mt-3 text-sm text-rose">{error}</p> : null}

      {autoEvent ? (
        <section className="mt-4 rounded-2xl bg-moss-soft p-4 text-sm">
          自動適用しました: {autoEvent.summary}
        </section>
      ) : null}
      {pendingApproval ? (
        <section className="mt-4 rounded-2xl border border-rose/30 bg-rose-soft p-4">
          <h2 className="font-medium">承認が必要です</h2>
          <p className="mt-1 text-sm">{pendingApproval.summary}</p>
          {pendingApproval.diff ? (
            <p className="text-sm text-ink-soft">差分: {pendingApproval.diff.summary}（v{pendingApproval.diff.fromVersion}→v{pendingApproval.diff.toVersion}）</p>
          ) : null}
          <p className="mt-1 text-xs text-ink-soft">承認するまで現行の行程は変わりません。</p>
          <div className="mt-3 flex gap-2">
            <button
              className="rounded-full bg-rose px-4 py-2 text-sm text-white"
              onClick={() => void post(`/api/approvals/${pendingApproval.id}/decision`, { decision: "APPROVE" })}
            >
              承認する
            </button>
            <button
              className="rounded-full border border-line px-4 py-2 text-sm"
              onClick={() => void post(`/api/approvals/${pendingApproval.id}/decision`, { decision: "REJECT" })}
            >
              却下
            </button>
          </div>
        </section>
      ) : null}

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <Card title="二人の希望">
          <ul className="space-y-2 text-sm">
            {data.session.input.preferences.map((p) => (
              <li key={p.id}>
                <span className="text-ink-soft">
                  {p.subject === "SELF" ? "自分" : p.subject === "PARTNER" ? "相手（伝聞）" : "両方"} / {p.priority}
                </span>
                <div>{p.content}</div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="残している仮定">
          <ul className="list-disc pl-4 text-sm">
            {(data.plan?.assumptions ?? []).map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Card>
        <Card title="Plan B">
          <ul className="space-y-2 text-sm">
            {(data.plan?.planB ?? []).map((b) => (
              <li key={b.id}>
                <div>{b.trigger}</div>
                {b.isVerifiedAlternative && b.candidateSpotId ? (
                  <div className="text-ink-soft">代替: {data.spots[b.candidateSpotId]?.name ?? b.candidateSpotId}</div>
                ) : (
                  <div className="text-ink-soft">{b.policy ?? "検証済み代替案ではない"}</div>
                )}
              </li>
            ))}
            {!data.plan?.planB.length ? <li className="text-ink-soft">現時点で追加の仮定は作っていません</li> : null}
          </ul>
        </Card>
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-card p-5">
        <h2 className="text-lg font-medium">タイムライン</h2>
        <ol className="mt-4 space-y-4">
          {(data.plan?.items ?? []).map((item, i) => {
            const spot = data.spots[item.spotId];
            return (
              <li key={item.id} className="rounded-2xl border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm text-ink-soft">
                      {formatTokyoHm(item.startAt)}–{formatTokyoHm(item.endAt)}
                    </div>
                    <div className="text-lg font-medium">{spot?.name ?? item.spotId}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {item.locked ? <span className="rounded-full bg-amber-soft px-2 py-1">時刻固定</span> : null}
                    <span className="rounded-full bg-paper-deep px-2 py-1">{item.progress}</span>
                    {spot?.environment.value ? <SourceChip kind="API" /> : <SourceChip kind="UNKNOWN" />}
                  </div>
                </div>
                <p className="mt-2 text-sm">{item.reason}</p>
                {spot?.costForTwoJpy.value ? (
                  <p className="text-sm text-ink-soft">
                    二人料金 上限¥{spot.costForTwoJpy.value.max}（取得）
                  </p>
                ) : (
                  <p className="text-sm text-ink-soft">料金不明。予算内とは断定しません</p>
                )}
                {spot?.officialUrl ? (
                  <a className="text-sm text-rose underline" href={spot.officialUrl} target="_blank" rel="noreferrer">
                    公式サイト
                  </a>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <button
                    className="rounded-full border border-line px-3 py-1 text-xs"
                    onClick={() =>
                      void post(`/api/sessions/${data.session.id}/progress`, {
                        itemId: item.id,
                        progress: "DONE",
                        status: i === 0 ? "IN_PROGRESS" : undefined,
                      })
                    }
                  >
                    完了にする
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
        {data.plan?.validation.issues.length ? (
          <ul className="mt-4 space-y-1 text-sm">
            {data.plan.validation.issues.map((iss) => (
              <li key={iss.code + iss.message}>
                {iss.severity}: {iss.message}
              </li>
            ))}
          </ul>
        ) : null}
        {data.plan?.memoryInfluences.length ? (
          <div className="mt-4 rounded-xl bg-paper-deep p-3 text-sm">
            <div className="font-medium">記憶の寄与</div>
            {data.plan.memoryInfluences.map((m) => (
              <div key={m.memoryId + m.detail}>
                {m.effect}: {m.detail}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-card p-5">
        <h2 className="text-lg font-medium">判断トレース</h2>
        <ol className="mt-3 space-y-2 text-sm">
          {data.events.map((e) => (
            <li key={e.eventId} className="flex gap-3">
              <span className="w-28 shrink-0 text-ink-soft">{e.type}</span>
              <span>{e.summary}</span>
              {e.actualModel ? <span className="text-ink-soft">({e.pool}/{e.actualModel})</span> : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-6 flex flex-wrap gap-2">
        <button
          className="rounded-full bg-ink px-4 py-2 text-sm text-white"
          onClick={() => void post(`/api/sessions/${data.session.id}/progress`, { confirm: true, status: "CONFIRMED" })}
        >
          この案で確定
        </button>
        <button
          className="rounded-full border border-line px-4 py-2 text-sm"
          onClick={() =>
            void post(`/api/sessions/${data.session.id}/scenarios`, {
              kind: "WEATHER",
              overlay: { precipitationMm: 8 },
              from: data.session.input.dateTokyo + "T13:00:00+09:00",
              to: data.session.input.dateTokyo + "T18:00:00+09:00",
            })
          }
        >
          雨を注入して再計画
        </button>
        <button
          className="rounded-full border border-line px-4 py-2 text-sm"
          onClick={() =>
            void post(`/api/sessions/${data.session.id}/scenarios`, {
              kind: "TRAVEL_DELAY",
              overlay: { delayMinutes: 35 },
              spotId: data.plan?.items.at(-1)?.spotId,
            })
          }
        >
          移動遅延を注入
        </button>
        <button
          className="rounded-full border border-line px-4 py-2 text-sm"
          onClick={async () => {
            const res = await api<{ text: string | null; blocked: boolean }>(
              `/api/sessions/${data.session.id}/message-draft`,
              { method: "POST", body: "{}" },
            );
            setDraft(res.blocked ? "出力検査で表示を止めました" : res.text);
          }}
        >
          共有文の下書き
        </button>
        <button
          className="rounded-full border border-line px-4 py-2 text-sm"
          onClick={async () => {
            const created = await api<{ sessionId: string }>(`/api/couples/${data.couple.id}/sessions`, {
              method: "POST",
              body: JSON.stringify(
                (data.session as { input: Record<string, unknown> }).input,
              ),
            });
            await api(`/api/sessions/${created.sessionId}/runs`, {
              method: "POST",
              body: JSON.stringify({ kind: "NEXT_PLAN" }),
            });
            router.push(`/sessions/${created.sessionId}`);
          }}
        >
          記憶を載せて次のデート
        </button>
        {latestRun ? (
          <button
            className="rounded-full border border-line px-4 py-2 text-sm"
            onClick={async () => {
              const res = await api<{ replayId: string }>(`/api/runs/${latestRun.id}/replay-export`, {
                method: "POST",
                body: "{}",
              });
              router.push(`/replay/${res.replayId}`);
            }}
          >
            REPLAYを保存
          </button>
        ) : null}
      </section>

      {draft ? (
        <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-paper-deep p-4 text-sm">{draft}</pre>
      ) : null}

      <section className="mt-8 rounded-3xl border border-line bg-card p-5">
        <h2 className="text-lg font-medium">振り返り</h2>
        <textarea
          className="mt-3 w-full rounded-xl border border-line bg-paper p-3 text-sm"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          className="mt-3 rounded-full bg-rose px-4 py-2 text-sm text-white"
          onClick={async () => {
            await post(`/api/sessions/${data.session.id}/progress`, { status: "DONE" });
            const run = await api<{ runId: string }>(`/api/sessions/${data.session.id}/runs`, {
              method: "POST",
              body: JSON.stringify({ kind: "REFLECTION" }),
            });
            await reload();
            void run;
          }}
        >
          確認質問をつくる
        </button>
        {latestRun?.waitingQuestion ? (
          <div className="mt-4 space-y-2">
            <p>{latestRun.waitingQuestion.prompt}</p>
            {latestRun.waitingQuestion.options.map((opt) => (
              <button
                key={opt}
                className="block w-full rounded-xl border border-line px-3 py-2 text-left text-sm"
                onClick={() =>
                  void post(`/api/runs/${latestRun.id}/answers`, {
                    questionId: latestRun.waitingQuestion!.id,
                    answer: opt,
                  })
                }
              >
                {opt}
              </button>
            ))}
          </div>
        ) : null}
        {data.memoryCandidates.length ? (
          <p className="mt-3 text-sm text-ink-soft">
            候補が {data.memoryCandidates.length} 件あります。承認するまで有効な記憶にはなりません。
          </p>
        ) : null}
      </section>

      <CostBadge
        llmUsd={cost.usdKnown ? cost.usd : null}
        llmJpy={cost.llm}
        apiJpy={cost.api}
        hard={cost.hard}
        mundane={cost.mundane}
        unaccounted={cost.unaccounted}
      />
    </main>
  );
}
