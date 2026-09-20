"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/client/api";
import { useMe } from "@/client/hooks/use-me";
import { ModeBanner } from "@/components/mode-banner";
import { Field } from "@/components/field";
import { tokyoToday } from "@/config/public";

export function HomeScreen() {
  const router = useRouter();
  const { me } = useMe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    dateTokyo: "",
    startTime: "13:00",
    endTime: "18:00",
    meetName: "",
    endName: "",
    meals: "8000",
    facilities: "4000",
    transit: "2000",
    self: "散歩と展示",
    partner: "甘いもの",
    auto: false,
  });

  const dateTokyo = form.dateTokyo || me?.demoDate || tokyoToday();
  const meetName =
    form.meetName ||
    (me?.demoAreaName?.includes("東京") ? "東京駅" : me?.demoAreaName) ||
    "東京駅";
  const endName =
    form.endName ||
    (me?.demoAreaName?.includes("東京") ? "東京駅" : me?.demoAreaName) ||
    "東京駅";

  async function submit() {
    if (!me) return;
    setBusy(true);
    setError(null);
    try {
      let coupleId = me.coupleId;
      if (!coupleId) {
        const created = await api<{ id: string }>("/api/couples", {
          method: "POST",
          body: JSON.stringify({ isDemo: true }),
        });
        coupleId = created.id;
      }
      const session = await api<{ sessionId: string }>(`/api/couples/${coupleId}/sessions`, {
        method: "POST",
        body: JSON.stringify({
          dateTokyo,
          startTime: form.startTime,
          endTime: form.endTime,
          meet: {
            name: meetName,
            lat: me.demoLat,
            lng: me.demoLng,
            spotId: null,
          },
          end: {
            name: endName,
            lat: me.demoLat,
            lng: me.demoLng,
            spotId: null,
          },
          budget: {
            mealsJpy: Number(form.meals),
            facilitiesJpy: Number(form.facilities),
            transitJpy: Number(form.transit),
          },
          preferences: [
            {
              id: "pref_self",
              subject: "SELF",
              content: form.self,
              priority: "PREFER",
              source: "SELF_REPORT",
            },
            {
              id: "pref_partner",
              subject: "PARTNER",
              content: form.partner,
              priority: "MUST",
              source: "PARTNER_STATEMENT_REPORTED",
            },
          ],
          fixedAppointments: [],
          autoApply: {
            enabled: form.auto,
            acknowledgedScope: form.auto
              ? "未着手・非固定の1件差し替え、PASS、予算増なし、終了を遅らせない、移動増なし"
              : null,
            validUntil: form.auto ? new Date(Date.now() + 86400000).toISOString() : null,
          },
          travelMode: "WALK",
          areaName: me.demoAreaName,
          areaLat: me.demoLat,
          areaLng: me.demoLng,
          radiusMeters: 2500,
        }),
      });
      await api(`/api/sessions/${session.sessionId}/runs`, {
        method: "POST",
        headers: { "Idempotency-Key": `init-${session.sessionId}` },
        body: JSON.stringify({ kind: "INITIAL_PLAN" }),
      });
      router.push(`/sessions/${session.sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-5 py-10">
      <header>
        <p className="text-sm tracking-widest text-rose">FUTARI LOG</p>
        <h1 className="mt-1 text-3xl font-semibold">ふたりログ</h1>
        <p className="mt-2 text-ink-soft">
          二人の希望を調整し、予定が崩れたら組み直し、確かめた記憶を次のデートに活かす。
          相手はこのアプリを使いません。
        </p>
      </header>
      {me ? (
        <ModeBanner
          runtime={me.runtime}
          emulator={me.emulator}
          dataBackend={me.dataBackend}
          authBackend={me.authBackend}
        />
      ) : null}
      {me?.blockers.length ? (
        <ul className="rounded-2xl border border-line bg-card p-4 text-sm text-ink-soft">
          {me.blockers.map((b) => (
            <li key={b.code}>BLOCKED / {b.item}</li>
          ))}
        </ul>
      ) : null}

      <section className="rounded-3xl border border-line bg-card p-6 shadow-sm">
        <h2 className="text-lg font-medium">デートの条件</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="日付（Asia/Tokyo）">
            <input
              type="date"
              value={dateTokyo}
              onChange={(e) => setForm({ ...form, dateTokyo: e.target.value })}
              className="w-full rounded-xl border border-line bg-paper px-3 py-2"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="開始">
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="w-full rounded-xl border border-line bg-paper px-3 py-2"
              />
            </Field>
            <Field label="終了">
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className="w-full rounded-xl border border-line bg-paper px-3 py-2"
              />
            </Field>
          </div>
          <Field label="集合（公共地点）">
            <input
              value={meetName}
              onChange={(e) => setForm({ ...form, meetName: e.target.value })}
              className="w-full rounded-xl border border-line bg-paper px-3 py-2"
            />
          </Field>
          <Field label="終わり">
            <input
              value={endName}
              onChange={(e) => setForm({ ...form, endName: e.target.value })}
              className="w-full rounded-xl border border-line bg-paper px-3 py-2"
            />
          </Field>
          <Field label="食事予算（二人合計円）">
            <input
              value={form.meals}
              onChange={(e) => setForm({ ...form, meals: e.target.value })}
              className="w-full rounded-xl border border-line bg-paper px-3 py-2"
            />
          </Field>
          <Field label="施設予算">
            <input
              value={form.facilities}
              onChange={(e) => setForm({ ...form, facilities: e.target.value })}
              className="w-full rounded-xl border border-line bg-paper px-3 py-2"
            />
          </Field>
          <Field label="自分の希望">
            <input
              value={form.self}
              onChange={(e) => setForm({ ...form, self: e.target.value })}
              className="w-full rounded-xl border border-line bg-paper px-3 py-2"
            />
          </Field>
          <Field label="相手の希望（伝聞）">
            <input
              value={form.partner}
              onChange={(e) => setForm({ ...form, partner: e.target.value })}
              className="w-full rounded-xl border border-line bg-paper px-3 py-2"
            />
          </Field>
        </div>
        <label className="mt-2 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.auto}
            onChange={(e) => setForm({ ...form, auto: e.target.checked })}
          />
          <span>
            自動変更を許可する（未着手・非固定の1件差し替え、検証PASS、予算増なし、終了を遅らせない、移動増なし）。初期値はOFF。
          </span>
        </label>
        {error ? <p className="mt-3 text-sm text-rose">{error}</p> : null}
        <button
          type="button"
          disabled={busy || !me}
          onClick={() => void submit()}
          className="mt-6 w-full rounded-full bg-rose px-5 py-3 font-medium text-white hover:bg-rose-hover disabled:opacity-60"
        >
          {!me ? "準備中…" : busy ? "行程を組み立てています…" : "行程をつくる"}
        </button>
      </section>
    </main>
  );
}
