"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from '@/lib/supabase/client';

interface SystemPrompt {
  id: string;
  name: string;
  prompt_content: string;
  temperature: number;
  max_tokens: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function PromptEditor() {
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<SystemPrompt | null>(null);
  const [loading, setLoading] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [testResponse, setTestResponse] = useState("");
  // Using sonner toast
  const supabase = createClient();

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    const { data, error } = await supabase
      .from("maya_system_prompts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to fetch prompts");
      return;
    }

    setPrompts(data || []);
    const activePrompt = data?.find(p => p.active);
    if (activePrompt) setSelectedPrompt(activePrompt);
  };

  const savePrompt = async () => {
    if (!selectedPrompt) return;
    setLoading(true);

    const { error } = await supabase
      .from("maya_system_prompts")
      .update({
        prompt_content: selectedPrompt.prompt_content,
        temperature: selectedPrompt.temperature,
        max_tokens: selectedPrompt.max_tokens,
      })
      .eq("id", selectedPrompt.id);

    if (error) {
      toast.error("Failed to save prompt");
    } else {
      toast.success("Prompt saved successfully");
      fetchPrompts();
    }
    setLoading(false);
  };

  const createNewPrompt = async () => {
    const newPrompt = {
      name: `custom_prompt_${Date.now()}`,
      prompt_content: selectedPrompt?.prompt_content || "",
      temperature: 0.7,
      max_tokens: 1000,
      active: false,
    };

    const { data, error } = await supabase
      .from("maya_system_prompts")
      .insert(newPrompt)
      .select()
      .single();

    if (error) {
      toast.error("Failed to create prompt");
    } else {
      toast.success("New prompt created");
      await fetchPrompts();
      setSelectedPrompt(data);
    }
  };

  const setActivePrompt = async (promptId: string) => {
    setLoading(true);
    
    // Deactivate all prompts
    await supabase
      .from("maya_system_prompts")
      .update({ active: false })
      .neq("id", "");

    // Activate selected prompt
    const { error } = await supabase
      .from("maya_system_prompts")
      .update({ active: true })
      .eq("id", promptId);

    if (error) {
      toast.error("Failed to activate prompt");
    } else {
      toast.success("Prompt activated");
      fetchPrompts();
    }
    setLoading(false);
  };

  const testPrompt = async () => {
    if (!testMessage || !selectedPrompt) return;
    setLoading(true);

    try {
      const response = await fetch("/api/test-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: selectedPrompt.prompt_content,
          temperature: selectedPrompt.temperature,
          message: testMessage,
        }),
      });

      const data = await response.json();
      setTestResponse(data.response);
    } catch (error) {
      toast.error("Failed to test prompt");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Maya Prompt Editor</CardTitle>
          <CardDescription>
            Customize Maya's personality and response style
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="editor">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="editor">Editor</TabsTrigger>
              <TabsTrigger value="test">Test</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="editor" className="space-y-4">
              <div>
                <Label>Select Prompt Version</Label>
                <Select
                  value={selectedPrompt?.id}
                  onValueChange={(id) => setSelectedPrompt(prompts.find(p => p.id === id) || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a prompt" />
                  </SelectTrigger>
                  <SelectContent>
                    {prompts.map(prompt => (
                      <SelectItem key={prompt.id} value={prompt.id}>
                        {prompt.name} {prompt.active && "(Active)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedPrompt && (
                <>
                  <div>
                    <Label>System Prompt</Label>
                    <Textarea
                      value={selectedPrompt.prompt_content}
                      onChange={(e) => setSelectedPrompt({
                        ...selectedPrompt,
                        prompt_content: e.target.value
                      })}
                      rows={15}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Temperature: {selectedPrompt.temperature}</Label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.1}
                        value={selectedPrompt.temperature}
                        onChange={(e) => setSelectedPrompt({
                          ...selectedPrompt,
                          temperature: parseFloat(e.target.value)
                        })}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                      />
                    </div>

                    <div>
                      <Label>Max Tokens</Label>
                      <Input
                        type="number"
                        value={selectedPrompt.max_tokens}
                        onChange={(e) => setSelectedPrompt({
                          ...selectedPrompt,
                          max_tokens: parseInt(e.target.value)
                        })}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={savePrompt} disabled={loading}>
                      Save Changes
                    </Button>
                    <Button 
                      onClick={() => setActivePrompt(selectedPrompt.id)} 
                      disabled={loading || selectedPrompt.active}
                      variant="secondary"
                    >
                      Set as Active
                    </Button>
                    <Button onClick={createNewPrompt} variant="outline">
                      Create New Version
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="test" className="space-y-4">
              <div>
                <Label>Test Message</Label>
                <Textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Type a message to test Maya's response..."
                  rows={3}
                />
              </div>

              <Button onClick={testPrompt} disabled={loading || !testMessage}>
                Test Response
              </Button>

              {testResponse && (
                <div className="rounded-lg bg-muted p-4">
                  <Label>Maya's Response:</Label>
                  <p className="mt-2 whitespace-pre-wrap">{testResponse}</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="history">
              <p className="text-muted-foreground">
                Prompt version history coming soon...
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}