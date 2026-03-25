"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Settings as SettingsIcon,
  Server,
  Key,
  CheckCircle,
  XCircle,
  ExternalLink,
} from "lucide-react";

interface HealthStatus {
  status: string;
  uptime?: string;
  services?: Record<string, string>;
}

export default function SettingsPage() {
  const [apiUrl, setApiUrl] = useState(
    process.env.NEXT_PUBLIC_API_URL ||
      "https://api.openclaw-yqar.srv1420157.hstgr.cloud"
  );
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [checking, setChecking] = useState(false);

  async function checkHealth() {
    setChecking(true);
    try {
      const res = await fetch(`/api/proxy?path=/api/health/quick`);
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth({ status: "unreachable" });
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <header>
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configuration and system status
            </p>
          </div>
        </div>
      </header>

      {/* API Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4" />
            API Connection
          </CardTitle>
          <CardDescription>
            Harv backend running on VPS (187.77.220.169)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              className="font-mono text-sm"
              readOnly
            />
            <Button onClick={checkHealth} disabled={checking} variant="outline">
              {checking ? "Checking..." : "Test"}
            </Button>
          </div>

          {health && (
            <div className="flex items-center gap-2">
              {health.status === "ok" || health.status === "healthy" ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-500">Connected</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-500">
                    {health.status}
                  </span>
                </>
              )}
              {health.uptime && (
                <span className="text-xs text-muted-foreground ml-2">
                  Uptime: {health.uptime}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Keys Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4" />
            API Keys & Services
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { name: "Anthropic (Claude)", status: "active" },
              { name: "OpenRouter", status: "active" },
              { name: "Ollama (Local)", status: "active" },
              { name: "Google OAuth", status: "active" },
              { name: "Telegram Bot", status: "active" },
              { name: "Twitter/X API", status: "active" },
              { name: "Spotify API", status: "active" },
              { name: "GitHub CLI", status: "needs auth" },
              { name: "GWS CLI", status: "needs auth" },
              { name: "Stripe CLI", status: "needs auth" },
            ].map((svc) => (
              <div key={svc.name} className="flex items-center justify-between">
                <span className="text-sm">{svc.name}</span>
                <Badge
                  variant="outline"
                  className={
                    svc.status === "active"
                      ? "bg-green-500/15 text-green-400 border-green-500/30"
                      : "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
                  }
                >
                  {svc.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">System Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">VPS</p>
              <p>Hostinger KVM (ID: 1420157)</p>
            </div>
            <div>
              <p className="text-muted-foreground">OS</p>
              <p>Ubuntu 24.04</p>
            </div>
            <div>
              <p className="text-muted-foreground">Active Model</p>
              <p>claude-haiku-4-5</p>
            </div>
            <div>
              <p className="text-muted-foreground">HTTPS</p>
              <p className="flex items-center gap-1">
                Let&apos;s Encrypt
                <CheckCircle className="h-3 w-3 text-green-500" />
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Dashboard</p>
              <a
                href="https://api.openclaw-yqar.srv1420157.hstgr.cloud"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                API <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div>
              <p className="text-muted-foreground">Agents</p>
              <p>24 registered (19 domain + 4 tools + 3 bg)</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
