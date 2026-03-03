"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createClient } from '@/lib/supabase/client';
// Using native Date methods instead of date-fns to avoid version conflicts
import { ChevronDown, ChevronUp, Search } from "lucide-react";

interface LLMLog {
  id: string;
  user_id: string;
  prompt_used: string;
  user_message: string;
  maya_response: string;
  model: string;
  provider: string;
  temperature: number;
  tokens_used: number;
  response_time_ms: number;
  metadata: any;
  created_at: string;
}

export function LLMLogsViewer() {
  const [logs, setLogs] = useState<LLMLog[]>([]);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState("7"); // days
  const supabase = createClient();

  useEffect(() => {
    fetchLogs();
  }, [dateFilter]);

  const fetchLogs = async () => {
    setLoading(true);
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - parseInt(dateFilter));

    const { data, error } = await supabase
      .from("maya_llm_logs")
      .select("*")
      .gte("created_at", dateFrom.toISOString())
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Error fetching logs:", error);
    } else {
      setLogs(data || []);
    }
    setLoading(false);
  };

  const analyzePatterns = () => {
    const wordFrequency: Record<string, number> = {};
    
    logs.forEach(log => {
      const words = log.maya_response.toLowerCase().split(/\s+/);
      words.forEach(word => {
        const cleanWord = word.replace(/[^a-z0-9]/g, '');
        if (cleanWord.length > 4) {
          wordFrequency[cleanWord] = (wordFrequency[cleanWord] || 0) + 1;
        }
      });
    });

    const sortedWords = Object.entries(wordFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20);

    return sortedWords;
  };

  const filteredLogs = logs.filter(log => 
    log.maya_response.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.user_message.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const commonPatterns = analyzePatterns();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Maya Response Logs</CardTitle>
          <CardDescription>
            Analyze Maya's responses and identify patterns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <div>
              <Label>Search Responses</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search messages..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <div>
              <Label>Time Period</Label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="1">Last 24 hours</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
              </select>
            </div>

            <div className="flex items-end">
              <Button onClick={fetchLogs} disabled={loading}>
                Refresh Logs
              </Button>
            </div>
          </div>

          {commonPatterns.length > 0 && (
            <div className="mb-6 rounded-lg bg-muted p-4">
              <h3 className="mb-2 font-semibold">Most Common Words (5+ letters):</h3>
              <div className="flex flex-wrap gap-2">
                {commonPatterns.map(([word, count]) => (
                  <Badge key={word} variant="secondary">
                    {word}: {count}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {filteredLogs.map(log => (
              <div key={log.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="outline">{log.provider}</Badge>
                      <Badge variant="outline">{log.model}</Badge>
                      <Badge variant="outline">temp: {log.temperature}</Badge>
                      {log.tokens_used && (
                        <Badge variant="outline">{log.tokens_used} tokens</Badge>
                      )}
                      {log.response_time_ms && (
                        <Badge variant="outline">{log.response_time_ms}ms</Badge>
                      )}
                    </div>
                    
                    <div className="text-sm text-muted-foreground">
                      {new Date(log.created_at).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </div>

                    <div className="mt-2">
                      <p className="font-medium">User: {log.user_message}</p>
                      <p className="mt-1">
                        Maya: {expandedLog === log.id 
                          ? log.maya_response 
                          : log.maya_response.slice(0, 150) + "..."}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  >
                    {expandedLog === log.id ? <ChevronUp /> : <ChevronDown />}
                  </Button>
                </div>

                {expandedLog === log.id && (
                  <div className="mt-4 space-y-2 border-t pt-4">
                    <div>
                      <Label>Full Response:</Label>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{log.maya_response}</p>
                    </div>
                    
                    {log.prompt_used && (
                      <div>
                        <Label>Prompt Used:</Label>
                        <p className="mt-1 whitespace-pre-wrap text-sm font-mono">
                          {log.prompt_used.slice(0, 500)}...
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}