'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Plus, 
  Download, 
  Server, 
  Cloud, 
  Cpu, 
  Eye,
  Trash2,
  Settings,
  Play,
  RefreshCw,
  ExternalLink,
  Home,
  Globe
} from 'lucide-react';

interface CustomModel {
  id: string;
  name: string;
  description: string;
  provider: 'ollama' | 'huggingface' | 'custom';
  endpoint?: string;
  apiKey?: string;
  modelPath?: string;
  huggingFaceRepo?: string;
  parameters: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
  };
  capabilities: {
    chat?: boolean;
    completion?: boolean;
    vision?: boolean;
    function_calling?: boolean;
  };
  isLocal: boolean;
  isCustom: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface OllamaModel {
  name: string;
  size: number;
  modified: string;
}

export default function ModelManagerPage() {
  const [models, setModels] = useState<CustomModel[]>([]);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'ollama' | 'huggingface' | 'custom'>('ollama');

  const [newModel, setNewModel] = useState({
    name: '',
    description: '',
    provider: 'ollama' as const,
    endpoint: '',
    apiKey: '',
    modelPath: '',
    huggingFaceRepo: '',
    parameters: {
      temperature: 0.7,
      maxTokens: 2048,
    },
    capabilities: {
      chat: true,
      completion: true,
      vision: false,
      function_calling: false,
    },
    isLocal: true,
  });

  useEffect(() => {
    loadModels();
    checkOllamaStatus();
  }, []);

  const loadModels = async () => {
    try {
      const response = await fetch('/api/admin/models');
      if (response.ok) {
        const data = await response.json();
        setModels(data.models || []);
      }
    } catch (error) {
      console.error('Error loading models:', error);
    }
  };

  const checkOllamaStatus = async () => {
    try {
      const response = await fetch('/api/admin/ollama/status');
      if (response.ok) {
        const data = await response.json();
        setOllamaAvailable(data.available);
        setOllamaModels(data.models || []);
      }
    } catch (error) {
      console.error('Error checking Ollama:', error);
      setOllamaAvailable(false);
    }
  };

  const handleAddModel = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newModel),
      });

      if (!response.ok) {
        throw new Error('Failed to add model');
      }

      toast.success('Model added successfully');
      setShowAddModel(false);
      resetNewModel();
      await loadModels();
    } catch (error) {
      console.error('Error adding model:', error);
      toast.error('Failed to add model');
    } finally {
      setLoading(false);
    }
  };

  const resetNewModel = () => {
    setNewModel({
      name: '',
      description: '',
      provider: 'ollama',
      endpoint: '',
      apiKey: '',
      modelPath: '',
      huggingFaceRepo: '',
      parameters: { temperature: 0.7, maxTokens: 2048 },
      capabilities: { chat: true, completion: true, vision: false, function_calling: false },
      isLocal: true,
    });
  };

  const handleDeleteModel = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/models/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete model');
      }

      toast.success('Model deleted');
      await loadModels();
    } catch (error) {
      console.error('Error deleting model:', error);
      toast.error('Failed to delete model');
    }
  };

  const handlePullOllamaModel = async (modelName: string) => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/ollama/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName }),
      });

      if (!response.ok) {
        throw new Error('Failed to pull model');
      }

      toast.success(`Pulling ${modelName}... This may take a while.`);
      
      // Refresh Ollama models after a delay
      setTimeout(() => {
        checkOllamaStatus();
      }, 5000);
    } catch (error) {
      console.error('Error pulling model:', error);
      toast.error('Failed to pull model');
    } finally {
      setLoading(false);
    }
  };

  const testModel = async (model: CustomModel) => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/models/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: model.id,
          testMessage: 'Hello, this is a test. Please respond briefly.',
        }),
      });

      if (!response.ok) {
        throw new Error('Test failed');
      }

      const data = await response.json();
      toast.success(`Test successful! Response: "${data.response.substring(0, 50)}..."`);
    } catch (error) {
      console.error('Error testing model:', error);
      toast.error('Model test failed');
    } finally {
      setLoading(false);
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'ollama': return <Home className="h-4 w-4" />;
      case 'huggingface': return <Globe className="h-4 w-4" />;
      case 'custom': return <Settings className="h-4 w-4" />;
      default: return <Server className="h-4 w-4" />;
    }
  };

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'ollama': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'huggingface': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'custom': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Server className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Model Manager</h1>
            <p className="text-gray-400">Manage local and remote AI models</p>
          </div>
        </div>

        <Dialog open={showAddModel} onOpenChange={setShowAddModel}>
          <DialogTrigger asChild>
            <Button className="bg-purple-600 hover:bg-purple-700">
              <Plus className="h-4 w-4 mr-2" />
              Add Model
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Model</DialogTitle>
              <DialogDescription className="text-gray-400">
                Configure a new AI model for Maya to use
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={newModel.name}
                    onChange={(e) => setNewModel({...newModel, name: e.target.value})}
                    className="bg-gray-800 border-gray-700"
                    placeholder="My Custom Model"
                  />
                </div>
                <div>
                  <Label>Provider</Label>
                  <Select value={newModel.provider} onValueChange={(value: any) => {
                    setNewModel({...newModel, provider: value, isLocal: value === 'ollama'});
                    setSelectedProvider(value);
                  }}>
                    <SelectTrigger className="bg-gray-800 border-gray-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      <SelectItem value="ollama">Ollama (Local)</SelectItem>
                      <SelectItem value="huggingface">HuggingFace</SelectItem>
                      <SelectItem value="custom">Custom Endpoint</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={newModel.description}
                  onChange={(e) => setNewModel({...newModel, description: e.target.value})}
                  className="bg-gray-800 border-gray-700"
                  placeholder="Brief description of the model's capabilities"
                />
              </div>

              {selectedProvider === 'ollama' && (
                <div>
                  <Label>Model Name</Label>
                  <Input
                    value={newModel.modelPath}
                    onChange={(e) => setNewModel({...newModel, modelPath: e.target.value})}
                    className="bg-gray-800 border-gray-700"
                    placeholder="llama2:7b, codellama:latest, etc."
                  />
                </div>
              )}

              {selectedProvider === 'huggingface' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Repository</Label>
                    <Input
                      value={newModel.huggingFaceRepo}
                      onChange={(e) => setNewModel({...newModel, huggingFaceRepo: e.target.value})}
                      className="bg-gray-800 border-gray-700"
                      placeholder="microsoft/DialoGPT-medium"
                    />
                  </div>
                  <div>
                    <Label>API Key (optional)</Label>
                    <Input
                      type="password"
                      value={newModel.apiKey}
                      onChange={(e) => setNewModel({...newModel, apiKey: e.target.value})}
                      className="bg-gray-800 border-gray-700"
                      placeholder="hf_..."
                    />
                  </div>
                </div>
              )}

              {selectedProvider === 'custom' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Endpoint URL</Label>
                    <Input
                      value={newModel.endpoint}
                      onChange={(e) => setNewModel({...newModel, endpoint: e.target.value})}
                      className="bg-gray-800 border-gray-700"
                      placeholder="https://api.example.com/v1/chat"
                    />
                  </div>
                  <div>
                    <Label>API Key (optional)</Label>
                    <Input
                      type="password"
                      value={newModel.apiKey}
                      onChange={(e) => setNewModel({...newModel, apiKey: e.target.value})}
                      className="bg-gray-800 border-gray-700"
                      placeholder="sk-..."
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Temperature</Label>
                  <Input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={newModel.parameters.temperature}
                    onChange={(e) => setNewModel({
                      ...newModel,
                      parameters: {...newModel.parameters, temperature: parseFloat(e.target.value)}
                    })}
                    className="bg-gray-800 border-gray-700"
                  />
                </div>
                <div>
                  <Label>Max Tokens</Label>
                  <Input
                    type="number"
                    value={newModel.parameters.maxTokens}
                    onChange={(e) => setNewModel({
                      ...newModel,
                      parameters: {...newModel.parameters, maxTokens: parseInt(e.target.value)}
                    })}
                    className="bg-gray-800 border-gray-700"
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddModel(false)} className="border-gray-700">
                Cancel
              </Button>
              <Button onClick={handleAddModel} disabled={loading || !newModel.name}>
                {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Add Model
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Ollama Status */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Home className="h-5 w-5 text-blue-400" />
            Ollama Status
          </CardTitle>
          <CardDescription className="text-gray-400">
            Local model runner for running LLMs locally
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {ollamaAvailable ? (
                <>
                  <div className="h-2 w-2 bg-green-400 rounded-full"></div>
                  <span className="text-green-400">Connected</span>
                  <span className="text-gray-400">• {ollamaModels.length} models available</span>
                </>
              ) : (
                <>
                  <div className="h-2 w-2 bg-red-400 rounded-full"></div>
                  <span className="text-red-400">Not Available</span>
                </>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={checkOllamaStatus} className="border-gray-700">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {ollamaAvailable && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-300 mb-2">Available Models</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {ollamaModels.map((model) => (
                  <div key={model.name} className="flex items-center justify-between p-2 bg-gray-800 rounded">
                    <span className="text-sm text-gray-300">{model.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Model List */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Configured Models</CardTitle>
          <CardDescription className="text-gray-400">
            Models available for Maya to use
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {models.map((model) => (
              <Card key={model.id} className="bg-gray-800 border-gray-700">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${getProviderColor(model.provider)}`}>
                        {getProviderIcon(model.provider)}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-white">{model.name}</h3>
                          <Badge className={getProviderColor(model.provider)}>
                            {model.provider}
                          </Badge>
                          {model.isLocal && (
                            <Badge className="bg-gray-700 text-gray-300">Local</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-400">{model.description}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>T: {model.parameters.temperature}</span>
                          <span>Max: {model.parameters.maxTokens}</span>
                          {model.capabilities.chat && <span>Chat</span>}
                          {model.capabilities.vision && <span>Vision</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testModel(model)}
                        disabled={loading}
                        className="border-green-600 text-green-400 hover:bg-green-600/10"
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Test
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteModel(model.id)}
                        className="border-red-600 text-red-400 hover:bg-red-600/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {models.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No custom models configured yet</p>
                <p className="text-sm">Add your first model to get started</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}