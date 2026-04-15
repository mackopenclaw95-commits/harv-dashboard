"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign,
  ChevronLeft,
  RefreshCw,
  Plus,
  Trash2,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";

type PricingUnit = "tokens" | "image" | "audio_minute" | "tts_char";

interface PricingRow {
  model: string;
  unit: PricingUnit;
  modality: string | null;
  input_per_million: number | null;
  output_per_million: number | null;
  per_unit_cost: number | null;
  provider: string | null;
  is_free: boolean | null;
  notes: string | null;
}

const EMPTY_ROW: PricingRow = {
  model: "",
  unit: "tokens",
  modality: "text",
  input_per_million: 0,
  output_per_million: 0,
  per_unit_cost: 0,
  provider: "openrouter",
  is_free: false,
  notes: null,
};

export default function PricingAdminPage() {
  const [rows, setRows] = useState<PricingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PricingRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/model-pricing");
      const data = await res.json();
      if (res.ok) {
        setRows(data.rows || []);
      } else {
        toast.error(data.error || "Failed to load pricing");
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!editing) return;
    if (!editing.model.trim()) {
      toast.error("Model is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/model-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Saved ${editing.model}`);
        setEditing(null);
        load();
      } else {
        toast.error(data.error || "Save failed");
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (model: string) => {
    if (!confirm(`Delete pricing row for ${model}? This cannot be undone.`)) return;
    try {
      const res = await fetch(
        `/api/admin/model-pricing?model=${encodeURIComponent(model)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (res.ok) {
        toast.success(`Deleted ${model}`);
        load();
      } else {
        toast.error(data.error || "Delete failed");
      }
    } catch (e) {
      toast.error(String(e));
    }
  };

  const filtered = rows.filter((r) =>
    !search || r.model.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Model Pricing</h1>
            <p className="text-sm text-muted-foreground">
              Source of truth for cost calculations. Drift cron compares these to OpenRouter live rates.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setEditing({ ...EMPTY_ROW })}
          >
            <Plus className="h-3.5 w-3.5" />
            Add row
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search */}
      <Input
        placeholder="Filter models…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground/50">
              No rows
            </p>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              <div className="grid grid-cols-[1fr_80px_110px_110px_80px_70px] gap-3 px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                <span>Model</span>
                <span>Unit</span>
                <span className="text-right">Input $/M</span>
                <span className="text-right">Output $/M</span>
                <span className="text-center">Free</span>
                <span></span>
              </div>
              {filtered.map((r) => (
                <div
                  key={r.model}
                  className="grid grid-cols-[1fr_80px_110px_110px_80px_70px] gap-3 px-4 py-2.5 items-center hover:bg-white/[0.02] cursor-pointer"
                  onClick={() => setEditing(r)}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-mono truncate">{r.model}</p>
                    {r.provider && (
                      <p className="text-[9px] text-muted-foreground/50">
                        {r.provider}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[9px] justify-self-start">
                    {r.unit}
                  </Badge>
                  <span className="text-xs font-mono text-right text-yellow-400/80">
                    {r.unit === "tokens"
                      ? `$${Number(r.input_per_million ?? 0).toFixed(4)}`
                      : "—"}
                  </span>
                  <span className="text-xs font-mono text-right text-yellow-400/80">
                    {r.unit === "tokens"
                      ? `$${Number(r.output_per_million ?? 0).toFixed(4)}`
                      : `$${Number(r.per_unit_cost ?? 0).toFixed(4)}/${
                          r.unit === "audio_minute" ? "min" : r.unit === "tts_char" ? "char" : "img"
                        }`}
                  </span>
                  <span className="text-center">
                    {r.is_free ? (
                      <Badge className="text-[9px] bg-emerald-500/20 text-emerald-400 border-0">free</Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/40">—</span>
                    )}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(r.model);
                    }}
                    className="justify-self-end text-muted-foreground/40 hover:text-red-400 transition-colors p-1"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setEditing(null)}
        >
          <Card
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  {rows.some((r) => r.model === editing.model) ? "Edit row" : "Add row"}
                </CardTitle>
                <button
                  onClick={() => setEditing(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <CardDescription>
                Fix rate drift here. Values are authoritative — the drift cron will stop alerting once your row matches OpenRouter.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Model ID
                </label>
                <Input
                  value={editing.model}
                  onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                  placeholder="e.g. openai/gpt-4.1"
                  className="font-mono text-xs"
                  disabled={rows.some((r) => r.model === editing.model)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Unit</label>
                  <select
                    value={editing.unit}
                    onChange={(e) => setEditing({ ...editing, unit: e.target.value as PricingUnit })}
                    className="w-full h-9 rounded-md border border-white/10 bg-white/[0.03] px-3 text-xs"
                  >
                    <option value="tokens">tokens</option>
                    <option value="image">image</option>
                    <option value="audio_minute">audio_minute</option>
                    <option value="tts_char">tts_char</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Provider</label>
                  <Input
                    value={editing.provider || ""}
                    onChange={(e) => setEditing({ ...editing, provider: e.target.value })}
                    placeholder="openrouter"
                    className="text-xs"
                  />
                </div>
              </div>

              {editing.unit === "tokens" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Input $/M</label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={editing.input_per_million ?? 0}
                      onChange={(e) => setEditing({ ...editing, input_per_million: Number(e.target.value) })}
                      className="text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Output $/M</label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={editing.output_per_million ?? 0}
                      onChange={(e) => setEditing({ ...editing, output_per_million: Number(e.target.value) })}
                      className="text-xs font-mono"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Price per {editing.unit === "audio_minute" ? "minute" : editing.unit === "tts_char" ? "character" : "image"}
                  </label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={editing.per_unit_cost ?? 0}
                    onChange={(e) => setEditing({ ...editing, per_unit_cost: Number(e.target.value) })}
                    className="text-xs font-mono"
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!!editing.is_free}
                  onChange={(e) => setEditing({ ...editing, is_free: e.target.checked })}
                />
                Is free model
              </label>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</label>
                <Input
                  value={editing.notes || ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  placeholder="Optional"
                  className="text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button size="sm" className="gap-2" onClick={save} disabled={saving}>
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "Saving" : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
