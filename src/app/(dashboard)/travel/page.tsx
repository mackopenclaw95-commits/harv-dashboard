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
import { Textarea } from "@/components/ui/textarea";
import {
  Plane,
  Hotel,
  MapPin,
  DollarSign,
  Calendar,
  Loader2,
  Compass,
  Luggage,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function TravelPage() {
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  // Trip planner form
  const [destination, setDestination] = useState("");
  const [dates, setDates] = useState("");
  const [budget, setBudget] = useState("");

  async function askTravel(message: string) {
    setLoading(true);
    setResponse("");
    try {
      const { askAgent } = await import("@/lib/agent-ask");
      const text = await askAgent("Travel", message);
      setResponse(text);
    } catch {
      toast.error("Failed to get response");
    } finally {
      setLoading(false);
    }
  }

  function handlePlanTrip() {
    if (!destination.trim()) {
      toast.error("Enter a destination");
      return;
    }
    let msg = `plan a trip to ${destination}`;
    if (dates) msg += ` for ${dates}`;
    if (budget) msg += ` with a budget of $${budget}`;
    askTravel(msg);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 ring-1 ring-sky-500/20">
            <Plane className="h-5 w-5 text-sky-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Travel</h1>
            <p className="text-sm text-muted-foreground">
              Plan trips, find flights and hotels, build itineraries
            </p>
          </div>
        </div>
      </header>

      {/* Trip Planner */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Compass className="h-4 w-4 text-sky-400" />
            Plan a Trip
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-1 block">Destination</label>
              <Input
                placeholder="Where to? (e.g., Tokyo, Bali)"
                value={destination}
                onChange={e => setDestination(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-1 block">Dates / Duration</label>
              <Input
                placeholder="e.g., 5 days in June"
                value={dates}
                onChange={e => setDates(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-1 block">Budget</label>
              <Input
                placeholder="e.g., 2000"
                value={budget}
                onChange={e => setBudget(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
          </div>
          <Button
            onClick={handlePlanTrip}
            disabled={loading || !destination.trim()}
            className="bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30"
          >
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plane className="h-4 w-4 mr-2" />}
            Plan My Trip
          </Button>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-6">
        {[
          { label: "Find Flights", icon: Plane, query: "find cheap flights from Charlotte", color: "text-sky-400" },
          { label: "Find Hotels", icon: Hotel, query: "best hotels in Miami Beach", color: "text-purple-400" },
          { label: "Things To Do", icon: MapPin, query: "things to do in Nashville this weekend", color: "text-emerald-400" },
          { label: "Packing List", icon: Luggage, query: "packing list for a week in Europe in summer", color: "text-amber-400" },
        ].map(({ label, icon: Icon, query: q, color }) => (
          <Button
            key={label}
            variant="outline"
            className="h-auto py-3 flex flex-col gap-1.5 hover:bg-white/[0.04]"
            onClick={() => { setQuery(q); askTravel(q); }}
            disabled={loading}
          >
            <Icon className={cn("h-5 w-5", color)} />
            <span className="text-xs">{label}</span>
          </Button>
        ))}
      </div>

      {/* Ask Travel Agent */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Compass className="h-4 w-4 text-sky-400" />
            Ask Travel Agent
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Ask about destinations, flights, hotels, budgets, tips..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !loading && askTravel(query)}
            />
            <Button onClick={() => askTravel(query)} disabled={loading || !query.trim()}>
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
