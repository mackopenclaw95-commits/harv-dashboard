"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, DollarSign, Zap, TrendingDown, Clock } from "lucide-react";

interface AnalyticsData {
  total_spend: number;
  daily_burn: number;
  total_calls: number;
  cost_by_agent: Record<string, number>;
  cost_by_model: Record<string, number>;
  recent_costs: Array<{ date: string; cost: number }>;
}

function formatCost(val: number) {
  return `$${val.toFixed(4)}`;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/proxy?path=/api/analytics/dashboard");
        const json = await res.json();
        setData(json);
      } catch {
        // Fallback data
        setData({
          total_spend: 0.6308,
          daily_burn: 0.06452,
          total_calls: 142,
          cost_by_agent: {
            Harv: 0.32,
            Router: 0.08,
            Journal: 0.06,
            Research: 0.05,
            Guardian: 0,
          },
          cost_by_model: {
            "claude-haiku-4-5": 0.32,
            "qwen3-8b": 0.08,
            "minimax-m2.1": 0.1,
            "deepseek-v3": 0.13,
          },
          recent_costs: [],
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  if (!data) return null;

  const projectedMonthly = data.daily_burn * 30;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">API cost tracking and usage</p>
      </header>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCost(data.total_spend)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Daily Burn</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCost(data.daily_burn)}</p>
            <p className="text-xs text-muted-foreground">
              ~{formatCost(projectedMonthly)}/mo projected
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">API Calls</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.total_calls}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Cost/Call</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {data.total_calls > 0
                ? formatCost(data.total_spend / data.total_calls)
                : "$0.00"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cost by agent + model */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost by Agent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(data.cost_by_agent || {})
                .sort(([, a], [, b]) => b - a)
                .map(([agent, cost]) => (
                  <div key={agent} className="flex items-center justify-between">
                    <span className="text-sm">{agent}</span>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{
                          width: `${Math.max(
                            4,
                            (cost / data.total_spend) * 200
                          )}px`,
                        }}
                      />
                      <span className="text-sm font-mono text-muted-foreground w-16 text-right">
                        {formatCost(cost)}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost by Model</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(data.cost_by_model || {})
                .sort(([, a], [, b]) => b - a)
                .map(([model, cost]) => (
                  <div key={model} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{model}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {model.includes("haiku")
                          ? "Anthropic"
                          : model.includes("qwen")
                          ? "Ollama"
                          : "OpenRouter"}
                      </Badge>
                    </div>
                    <span className="text-sm font-mono text-muted-foreground">
                      {formatCost(cost)}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      {data.recent_costs && data.recent_costs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recent Costs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recent_costs.slice(0, 10).map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground">{entry.date}</span>
                  <span className="font-mono">{formatCost(entry.cost)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
