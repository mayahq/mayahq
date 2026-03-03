'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus,
  Pencil,
  Trash2,
  Moon,
  Eye,
  EyeOff,
  Volume2,
  Download,
  Play,
  Loader2,
  Clock,
  FileAudio,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface Scenario {
  id: string;
  name: string;
  character: string;
  setting: string;
  dynamic: string;
  description: string;
  preferred_voice_tags: string[];
  temperature: number;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface ScenarioFormData {
  name: string;
  character: string;
  setting: string;
  dynamic: string;
  description: string;
  preferred_voice_tags: string;
  temperature: string;
  is_active: boolean;
}

interface AudioEntry {
  sessionId: string;
  scenarioName: string | null;
  dialogContent: string | null;
  dialogWordCount: number | null;
  voiceTagsUsed: string[] | null;
  triggerType: string;
  completedAt: string | null;
  messageId: string | null;
  audioUrl: string | null;
  ttsGeneratedAt: string | null;
}

const AVAILABLE_VOICE_TAGS = [
  'whispers', 'breathlessly', 'moans', 'softly', 'seductively',
  'teasingly', 'laughs', 'sighs', 'gasps', 'pause', 'purring',
  'trembling', 'growling', 'pleading', 'commanding', 'gasping', 'whimpering',
];

const emptyForm: ScenarioFormData = {
  name: '',
  character: '',
  setting: '',
  dynamic: '',
  description: '',
  preferred_voice_tags: '',
  temperature: '0.85',
  is_active: true,
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export default function MidnightMayaPage() {
  const { supabase } = useAuth();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingScenario, setEditingScenario] = useState<Scenario | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Scenario | null>(null);
  const [formData, setFormData] = useState<ScenarioFormData>(emptyForm);
  const [audioEntries, setAudioEntries] = useState<AudioEntry[]>([]);
  const [audioLoading, setAudioLoading] = useState(true);
  const [selectedAudio, setSelectedAudio] = useState<AudioEntry | null>(null);
  const [generatingTTS, setGeneratingTTS] = useState<string | null>(null);

  useEffect(() => {
    fetchScenarios();
    fetchAudioEntries();
  }, []);

  const fetchScenarios = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('roleplay_scenarios')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setScenarios(data || []);
    } catch (error) {
      console.error('Error fetching scenarios:', error);
      toast.error('Failed to load scenarios');
    } finally {
      setLoading(false);
    }
  };

  const fetchAudioEntries = async () => {
    try {
      setAudioLoading(true);
      const { data: sessions, error: sessionsError } = await supabase
        .from('roleplay_sessions')
        .select('*')
        .eq('status', 'completed')
        .not('dialog_message_id', 'is', null)
        .order('completed_at', { ascending: false });

      if (sessionsError) throw sessionsError;
      if (!sessions || sessions.length === 0) {
        setAudioEntries([]);
        return;
      }

      const messageIds = sessions.map(s => s.dialog_message_id).filter((id): id is string => id != null);
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('id, metadata')
        .in('id', messageIds);

      if (messagesError) throw messagesError;

      const messageMap = new Map<string, Record<string, unknown>>();
      (messages || []).forEach(m => {
        messageMap.set(m.id, (m.metadata as Record<string, unknown>) || {});
      });

      const entries: AudioEntry[] = sessions.map(s => {
        const msgId: string | null = s.dialog_message_id;
        const meta = (msgId && messageMap.get(msgId)) || {};
        return {
          sessionId: s.id,
          scenarioName: s.scenario_name,
          dialogContent: s.dialog_content,
          dialogWordCount: s.dialog_word_count,
          voiceTagsUsed: s.voice_tags_used,
          triggerType: s.trigger_type,
          completedAt: s.completed_at,
          messageId: s.dialog_message_id,
          audioUrl: (meta.audioUrl as string) || null,
          ttsGeneratedAt: (meta.ttsGeneratedAt as string) || null,
        };
      });

      setAudioEntries(entries);
    } catch (error) {
      console.error('Error fetching audio entries:', error);
      toast.error('Failed to load audio library');
    } finally {
      setAudioLoading(false);
    }
  };

  const handleGenerateTTS = async (entry: AudioEntry) => {
    if (generatingTTS || !entry.messageId || !entry.dialogContent) return;
    setGeneratingTTS(entry.sessionId);
    try {
      const response = await fetch('/api/roleplay/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: entry.messageId, text: entry.dialogContent }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TTS] Error:', response.status, errorText);
        toast.error(
          response.status === 504
            ? 'TTS timed out — the audio may still be processing. Try refreshing in a minute.'
            : `TTS failed: ${response.status}`
        );
        return;
      }

      const { audioUrl } = await response.json();
      setAudioEntries(prev =>
        prev.map(e =>
          e.sessionId === entry.sessionId
            ? { ...e, audioUrl, ttsGeneratedAt: new Date().toISOString() }
            : e
        )
      );
      if (selectedAudio?.sessionId === entry.sessionId) {
        setSelectedAudio(prev =>
          prev ? { ...prev, audioUrl, ttsGeneratedAt: new Date().toISOString() } : null
        );
      }
      toast.success('Audio generated successfully');
    } catch (error) {
      console.error('[TTS] Error:', error);
      toast.error('Failed to generate audio');
    } finally {
      setGeneratingTTS(null);
    }
  };

  const handleCreate = () => {
    setEditingScenario(null);
    setFormData(emptyForm);
    setIsEditModalOpen(true);
  };

  const handleEdit = (scenario: Scenario) => {
    setEditingScenario(scenario);
    setFormData({
      name: scenario.name,
      character: scenario.character,
      setting: scenario.setting,
      dynamic: scenario.dynamic,
      description: scenario.description,
      preferred_voice_tags: scenario.preferred_voice_tags.join(', '),
      temperature: scenario.temperature.toString(),
      is_active: scenario.is_active,
    });
    setIsEditModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.character || !formData.setting || !formData.dynamic || !formData.description) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const tags = formData.preferred_voice_tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      const payload = {
        name: formData.name,
        character: formData.character,
        setting: formData.setting,
        dynamic: formData.dynamic,
        description: formData.description,
        preferred_voice_tags: tags,
        temperature: parseFloat(formData.temperature) || 0.85,
        is_active: formData.is_active,
      };

      if (editingScenario) {
        const { error } = await supabase
          .from('roleplay_scenarios')
          .update(payload)
          .eq('id', editingScenario.id);
        if (error) throw error;
        toast.success('Scenario updated');
      } else {
        const id = slugify(formData.name);
        if (!id) {
          toast.error('Name must produce a valid ID');
          return;
        }
        const maxOrder = scenarios.length > 0
          ? Math.max(...scenarios.map(s => s.display_order))
          : -1;

        const { error } = await supabase
          .from('roleplay_scenarios')
          .insert({ ...payload, id, display_order: maxOrder + 1 });
        if (error) throw error;
        toast.success('Scenario created');
      }

      setIsEditModalOpen(false);
      fetchScenarios();
    } catch (error: any) {
      console.error('Error saving scenario:', error);
      toast.error(error.message || 'Failed to save scenario');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase
        .from('roleplay_scenarios')
        .delete()
        .eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success('Scenario deleted');
      setDeleteTarget(null);
      fetchScenarios();
    } catch (error: any) {
      console.error('Error deleting scenario:', error);
      toast.error(error.message || 'Failed to delete scenario');
    }
  };

  const handleToggleActive = async (scenario: Scenario) => {
    try {
      const { error } = await supabase
        .from('roleplay_scenarios')
        .update({ is_active: !scenario.is_active })
        .eq('id', scenario.id);
      if (error) throw error;
      toast.success(`${scenario.name} ${scenario.is_active ? 'deactivated' : 'activated'}`);
      fetchScenarios();
    } catch (error: any) {
      toast.error(error.message || 'Failed to toggle status');
    }
  };

  const activeCount = scenarios.filter(s => s.is_active).length;
  const inactiveCount = scenarios.length - activeCount;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Midnight Maya</h1>
          <p className="text-muted-foreground">
            Manage roleplay scenarios and characters
          </p>
        </div>
      </div>

      <Tabs defaultValue="scenarios">
        <TabsList>
          <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
          <TabsTrigger value="audio">Audio Library</TabsTrigger>
        </TabsList>

        <TabsContent value="scenarios" className="space-y-6">
          <div className="flex justify-end">
            <Button onClick={handleCreate} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Scenario
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Scenarios</CardTitle>
                <Moon className="h-4 w-4 text-purple-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{scenarios.length}</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active</CardTitle>
                <Eye className="h-4 w-4 text-green-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-400">{activeCount}</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Inactive</CardTitle>
                <EyeOff className="h-4 w-4 text-gray-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-500">{inactiveCount}</div>
              </CardContent>
            </Card>
          </div>

          {/* Scenarios Table */}
          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <CardTitle>Scenarios</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                </div>
              ) : scenarios.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No scenarios yet. Click &quot;Add Scenario&quot; to create one.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800">
                      <TableHead>Character</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Temp</TableHead>
                      <TableHead>Voice Tags</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scenarios.map((scenario) => (
                      <TableRow key={scenario.id} className="border-gray-800">
                        <TableCell>
                          <div>
                            <div className="font-medium">{scenario.name}</div>
                            <div className="text-sm text-gray-500">{scenario.character}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-xs truncate text-sm text-gray-400">
                            {scenario.description}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono">{scenario.temperature}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {scenario.preferred_voice_tags.map(tag => (
                              <Badge key={tag} variant="outline" className="text-xs border-purple-500/30 text-purple-400">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={scenario.is_active ? 'default' : 'secondary'}
                            className={scenario.is_active ? 'bg-green-500/20 text-green-400 border-green-500/30' : ''}
                          >
                            {scenario.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleActive(scenario)}
                              title={scenario.is_active ? 'Deactivate' : 'Activate'}
                            >
                              {scenario.is_active ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(scenario)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTarget(scenario)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audio" className="space-y-6">
          {/* Audio Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
                <FileAudio className="h-4 w-4 text-purple-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{audioEntries.length}</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">With Audio</CardTitle>
                <Volume2 className="h-4 w-4 text-green-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-400">
                  {audioEntries.filter(e => e.audioUrl).length}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending TTS</CardTitle>
                <Clock className="h-4 w-4 text-yellow-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-400">
                  {audioEntries.filter(e => !e.audioUrl && e.dialogContent).length}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Audio Library Table */}
          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <CardTitle>Completed Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              {audioLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                </div>
              ) : audioEntries.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No completed roleplay sessions yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800">
                      <TableHead>Character</TableHead>
                      <TableHead>Words</TableHead>
                      <TableHead>Voice Tags</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Audio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audioEntries.map((entry) => (
                      <TableRow
                        key={entry.sessionId}
                        className="border-gray-800 cursor-pointer hover:bg-gray-800/50"
                        onClick={() => setSelectedAudio(entry)}
                      >
                        <TableCell>
                          <div className="font-medium">{entry.scenarioName || 'Unknown'}</div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono">{entry.dialogWordCount ?? '—'}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {entry.voiceTagsUsed?.map(tag => (
                              <Badge key={tag} variant="outline" className="text-xs border-purple-500/30 text-purple-400">
                                {tag}
                              </Badge>
                            )) || <span className="text-gray-500 text-sm">—</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              entry.triggerType === 'cron'
                                ? 'border-blue-500/30 text-blue-400'
                                : 'border-orange-500/30 text-orange-400'
                            }
                          >
                            {entry.triggerType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-gray-400">{formatDate(entry.completedAt)}</span>
                        </TableCell>
                        <TableCell>
                          <div onClick={(e) => e.stopPropagation()}>
                            {entry.audioUrl ? (
                              <div className="flex items-center gap-2">
                                <audio src={entry.audioUrl} controls className="h-8 w-36" />
                                <a
                                  href={entry.audioUrl}
                                  download
                                  className="text-gray-400 hover:text-white transition-colors"
                                  title="Download MP3"
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                              </div>
                            ) : entry.dialogContent ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-purple-500/30 text-purple-400 hover:bg-purple-600/20"
                                disabled={generatingTTS !== null}
                                onClick={() => handleGenerateTTS(entry)}
                              >
                                {generatingTTS === entry.sessionId ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                    Generating...
                                  </>
                                ) : (
                                  <>
                                    <Play className="h-3.5 w-3.5 mr-1.5" />
                                    Generate
                                  </>
                                )}
                              </Button>
                            ) : (
                              <span className="text-gray-500 text-sm">No script</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-800">
          <DialogHeader>
            <DialogTitle>
              {editingScenario ? `Edit ${editingScenario.name}` : 'Create Scenario'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Brooklyn"
                className="bg-gray-800 border-gray-700"
              />
              {!editingScenario && formData.name && (
                <p className="text-xs text-gray-500 mt-1">
                  ID: {slugify(formData.name) || '...'}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="character">Character *</Label>
              <Input
                id="character"
                value={formData.character}
                onChange={(e) => setFormData({ ...formData, character: e.target.value })}
                placeholder="e.g. Brooklyn — confident DUMBO loft girl"
                className="bg-gray-800 border-gray-700"
              />
            </div>

            <div>
              <Label htmlFor="setting">Setting *</Label>
              <Textarea
                id="setting"
                value={formData.setting}
                onChange={(e) => setFormData({ ...formData, setting: e.target.value })}
                placeholder="Describe the scene setting..."
                rows={2}
                className="bg-gray-800 border-gray-700"
              />
            </div>

            <div>
              <Label htmlFor="dynamic">Dynamic *</Label>
              <Textarea
                id="dynamic"
                value={formData.dynamic}
                onChange={(e) => setFormData({ ...formData, dynamic: e.target.value })}
                placeholder="Describe the relationship dynamic..."
                rows={2}
                className="bg-gray-800 border-gray-700"
              />
            </div>

            <div>
              <Label htmlFor="description">Short Description * (shown in scenario offer)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="One-liner teaser..."
                rows={2}
                className="bg-gray-800 border-gray-700"
              />
            </div>

            <div>
              <Label htmlFor="voice_tags">Preferred Voice Tags (comma-separated)</Label>
              <Input
                id="voice_tags"
                value={formData.preferred_voice_tags}
                onChange={(e) => setFormData({ ...formData, preferred_voice_tags: e.target.value })}
                placeholder="commanding, breathlessly, whispers"
                className="bg-gray-800 border-gray-700"
              />
              <p className="text-xs text-gray-500 mt-1">
                Available: {AVAILABLE_VOICE_TAGS.join(', ')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="temperature">Temperature</Label>
                <Input
                  id="temperature"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={formData.temperature}
                  onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                  className="bg-gray-800 border-gray-700"
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-purple-600 hover:bg-purple-700">
              {editingScenario ? 'Update' : 'Create'} Scenario
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-gray-900 border-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this scenario. It won&apos;t appear in future roleplay offers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Audio Detail Modal */}
      <Dialog open={!!selectedAudio} onOpenChange={(open) => !open && setSelectedAudio(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileAudio className="h-5 w-5 text-purple-400" />
              {selectedAudio?.scenarioName || 'Unknown'} — {formatDate(selectedAudio?.completedAt ?? null)}
            </DialogTitle>
          </DialogHeader>

          {selectedAudio && (
            <div className="space-y-5">
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Word Count</p>
                  <p className="text-sm font-mono">{selectedAudio.dialogWordCount ?? '—'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Trigger</p>
                  <Badge
                    variant="outline"
                    className={
                      selectedAudio.triggerType === 'cron'
                        ? 'border-blue-500/30 text-blue-400'
                        : 'border-orange-500/30 text-orange-400'
                    }
                  >
                    {selectedAudio.triggerType}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Voice Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedAudio.voiceTagsUsed?.map(tag => (
                      <Badge key={tag} variant="outline" className="text-xs border-purple-500/30 text-purple-400">
                        {tag}
                      </Badge>
                    )) || <span className="text-sm text-gray-500">—</span>}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">TTS Generated</p>
                  <p className="text-sm">{selectedAudio.ttsGeneratedAt ? formatDate(selectedAudio.ttsGeneratedAt) : 'Not yet'}</p>
                </div>
              </div>

              {/* Audio Player */}
              <div className="space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Audio</p>
                {selectedAudio.audioUrl ? (
                  <div className="space-y-2">
                    <audio src={selectedAudio.audioUrl} controls className="w-full" />
                    <a
                      href={selectedAudio.audioUrl}
                      download
                      className="inline-flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download MP3
                    </a>
                  </div>
                ) : selectedAudio.dialogContent ? (
                  <Button
                    variant="outline"
                    className="border-purple-500/30 text-purple-400 hover:bg-purple-600/20"
                    disabled={generatingTTS !== null}
                    onClick={() => handleGenerateTTS(selectedAudio)}
                  >
                    {generatingTTS === selectedAudio.sessionId ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating audio...
                      </>
                    ) : (
                      <>
                        <Volume2 className="h-4 w-4 mr-2" />
                        Generate Audio
                      </>
                    )}
                  </Button>
                ) : (
                  <p className="text-sm text-gray-500">No script available</p>
                )}
              </div>

              {/* Script */}
              <div className="space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Script</p>
                {selectedAudio.dialogContent ? (
                  <div className="max-h-64 overflow-y-auto rounded-lg bg-gray-800/50 border border-gray-700 p-4">
                    <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                      {selectedAudio.dialogContent}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No script content</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
