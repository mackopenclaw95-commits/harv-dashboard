"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  PieChart,
  Receipt,
  Target,
  Loader2,
  Plus,
  BarChart3,
  Lightbulb,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function FinancePage() {
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  // Quick log form
  const [logAmount, setLogAmount] = useState("");
  const [logDesc, setLogDesc] = useState("");
  const [logType, setLogType] = useState<"expense" | "income">("expense");

  async function askFinance(message: string) {
    setLoading(true);
    setResponse("");
    try {
      const res = await fetch("/api/chat/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, agent: "Finance" }),
      });
      const data = await res.json();
      setResponse(data.response || data.text || data.message || JSON.stringify(data));
    } catch {
      toast.error("Failed to get response");
    } finally {
      setLoading(false);
    }
  }

  function handleQuickLog() {
    if (!logAmount || !logDesc) {
      toast.error("Enter amount and description");
      return;
    }
    const msg = logType === "income"
      ? `earned $${logAmount} ${logDesc}`
      : `spent $${logAmount} on ${logDesc}`;
    askFinance(msg);
    setLogAmount("");
    setLogDesc("");
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/15 ring-1 ring-green-500/20">
            <DollarSign className="h-5 w-5 text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
            <p className="text-sm text-muted-foreground">
              Track spending, manage budgets, get financial insights
            </p>
          </div>
        </div>
      </header>

      {/* Quick Log Transaction */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Receipt className="h-4 w-4 text-green-400" />
            Quick Log
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="flex rounded-lg ring-1 ring-white/[0.08] overflow-hidden">
              <button
                onClick={() => setLogType("expense")}
                className={cn("px-3 py-2 text-xs font-medium transition-colors",
                  logType === "expense" ? "bg-red-500/20 text-red-400" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <TrendingDown className="h-3.5 w-3.5 inline mr-1" />
                Expense
              </button>
              <button
                onClick={() => setLogType("income")}
                className={cn("px-3 py-2 text-xs font-medium transition-colors",
                  logType === "income" ? "bg-green-500/20 text-green-400" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <TrendingUp className="h-3.5 w-3.5 inline mr-1" />
                Income
              </button>
            </div>
            <Input
              placeholder="$0.00"
              value={logAmount}
              onChange={e => setLogAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="w-24 text-center"
            />
            <Input
              placeholder="Description (e.g., groceries, salary)"
              value={logDesc}
              onChange={e => setLogDesc(e.target.value)}
              className="flex-1"
              onKeyDown={e => e.key === "Enter" && handleQuickLog()}
            />
            <Button onClick={handleQuickLog} disabled={loading}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-6">
        {[
          { label: "Monthly Summary", icon: BarChart3, query: "show me my monthly summary", color: "text-green-400" },
          { label: "Check Budgets", icon: Target, query: "check my budget status", color: "text-amber-400" },
          { label: "Recent Transactions", icon: Receipt, query: "show my recent transactions", color: "text-blue-400" },
          { label: "Spending Analysis", icon: PieChart, query: "analyze my spending patterns", color: "text-purple-400" },
        ].map(({ label, icon: Icon, query: q, color }) => (
          <Button
            key={label}
            variant="outline"
            className="h-auto py-3 flex flex-col gap-1.5 hover:bg-white/[0.04]"
            onClick={() => { setQuery(q); askFinance(q); }}
            disabled={loading}
          >
            <Icon className={cn("h-5 w-5", color)} />
            <span className="text-xs">{label}</span>
          </Button>
        ))}
      </div>

      {/* Budget Quick Set */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-amber-400" />
            Set Budget
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
            {["Food $500", "Transport $200", "Entertainment $150", "Shopping $300"].map(budget => (
              <Button
                key={budget}
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => askFinance(`set ${budget.split(" ")[0].toLowerCase()} budget to ${budget.split(" ")[1]}/month`)}
                disabled={loading}
              >
                {budget}/mo
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Ask Finance Agent */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-green-400" />
            Ask Finance Agent
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Ask about budgets, spending, savings tips, financial advice..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !loading && askFinance(query)}
            />
            <Button onClick={() => askFinance(query)} disabled={loading || !query.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Response */}
      {response && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{response}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
