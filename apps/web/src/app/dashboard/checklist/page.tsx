"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Circle, AlertTriangle, RefreshCw } from "lucide-react";

interface ChecklistItem {
  id: string;
  key: string;
  label: string;
  completed: boolean;
  category: string;
  sortOrder: number;
}

interface ChecklistData {
  items: ChecklistItem[];
  progress: { completed: number; total: number; percentage: number };
  requiredProgress: { completed: number; total: number; percentage: number };
  blocking: { key: string; label: string }[];
  readyToGoLive: boolean;
}

export default function ChecklistPage() {
  const { token, currentTenant } = useAuth();
  const [data, setData] = useState<ChecklistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchChecklist = async () => {
    if (!token || !currentTenant) return;
    try {
      const res = await fetch("/api/checklist", {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant.id,
        },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to fetch checklist:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChecklist();
  }, [token, currentTenant]);

  const toggleItem = async (key: string, completed: boolean) => {
    if (!token || !currentTenant) return;
    setUpdating(key);
    try {
      const endpoint = completed ? "/api/checklist/uncomplete" : "/api/checklist/complete";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant.id,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key }),
      });
      if (res.ok) {
        await fetchChecklist();
      }
    } catch (err) {
      console.error("Failed to update item:", err);
    } finally {
      setUpdating(null);
    }
  };

  const resetChecklist = async () => {
    if (!token || !currentTenant) return;
    setLoading(true);
    try {
      await fetch("/api/checklist/reset", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant.id,
        },
      });
      await fetchChecklist();
    } catch (err) {
      console.error("Failed to reset checklist:", err);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Go Live Checklist</h1>
            <p className="text-muted-foreground">Complete these steps before launching your app</p>
          </div>
          <Button variant="outline" size="sm" onClick={resetChecklist} data-testid="button-reset-checklist">
            <RefreshCw className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">Loading checklist...</CardContent>
          </Card>
        ) : data ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Progress</span>
                  <span className="text-lg" data-testid="text-progress-count">
                    {data.progress.completed} / {data.progress.total}
                  </span>
                </CardTitle>
                <CardDescription>
                  {data.readyToGoLive
                    ? "All required items completed! Ready to go live."
                    : `${data.requiredProgress.total - data.requiredProgress.completed} required items remaining`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Progress value={data.progress.percentage} className="h-3" data-testid="progress-bar" />
                <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                  <span>{data.progress.percentage}% complete</span>
                  {data.readyToGoLive && (
                    <Badge variant="default" className="bg-green-600" data-testid="badge-ready">
                      Ready to Go Live
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {data.blocking.length > 0 && (
              <Card className="border-yellow-500/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-yellow-600">
                    <AlertTriangle className="h-5 w-5" />
                    What&apos;s Blocking Go Live
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {data.blocking.map((item) => (
                      <li key={item.key} className="flex items-center gap-2 text-sm" data-testid={`blocking-${item.key}`}>
                        <Circle className="h-4 w-4 text-yellow-600" />
                        {item.label}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Checklist Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                      data-testid={`checklist-item-${item.key}`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleItem(item.key, item.completed)}
                          disabled={updating === item.key}
                          className="focus:outline-none"
                          data-testid={`button-toggle-${item.key}`}
                        >
                          {item.completed ? (
                            <CheckCircle className="h-6 w-6 text-green-600" />
                          ) : (
                            <Circle className="h-6 w-6 text-muted-foreground" />
                          )}
                        </button>
                        <div>
                          <p className={item.completed ? "line-through text-muted-foreground" : ""}>
                            {item.label}
                          </p>
                          <Badge variant="outline" className="mt-1 text-xs">
                            {item.category}
                          </Badge>
                        </div>
                      </div>
                      {updating === item.key && (
                        <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Failed to load checklist. Please try again.
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
