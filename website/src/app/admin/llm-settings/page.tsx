'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Settings, 
  Zap, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Play, 
  Brain,
  Sparkles,
  MessageSquare,
  Server,
  Globe,
  Home,
  Plus
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PromptEditor } from '@/components/admin/prompt-editor';
import { LLMLogsViewer } from '@/components/admin/llm-logs-viewer';

interface LLMProviderConfig {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon: any;
  apiKeyEnvVar?: string;
  modelOptions: string[];
  defaultModel: string;
  isEnabled: boolean;
  currentModel?: string;
  color: string;
  type: 'remote' | 'local' | 'custom';
  customModels?: any[];
}

const PROVIDERS: LLMProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'anthropic',
    displayName: 'Anthropic Claude',
    description: 'Advanced reasoning and analysis with Claude Opus 4',
    icon: Brain,
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    modelOptions: ['claude-opus-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
    defaultModel: 'claude-opus-4-20250514',
    isEnabled: false,
    color: 'orange',
    type: 'remote'
  },
  {
    id: 'xai',
    name: 'xai',
    displayName: 'xAI Grok',
    description: 'Real-time knowledge and conversational AI',
    icon: Zap,
    apiKeyEnvVar: 'XAI_API_KEY',
    modelOptions: ['grok-4-0709', 'grok-beta', 'grok-vision-beta'],
    defaultModel: 'grok-4-0709',
    isEnabled: false,
    color: 'blue',
    type: 'remote'
  },
  {
    id: 'openai',
    name: 'openai',
    displayName: 'OpenAI GPT',
    description: 'General purpose language understanding',
    icon: MessageSquare,
    apiKeyEnvVar: 'OPENAI_API_KEY',
    modelOptions: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4',
    isEnabled: false,
    color: 'green',
    type: 'remote'
  },
  {
    id: 'ollama',
    name: 'ollama',
    displayName: 'Ollama (Local)',
    description: 'Run large language models locally on your machine',
    icon: Home,
    modelOptions: [], // Will be populated dynamically
    defaultModel: 'llama2:7b',
    isEnabled: false,
    color: 'purple',
    type: 'local',
    customModels: []
  },
  {
    id: 'huggingface',
    name: 'huggingface',
    displayName: 'HuggingFace',
    description: 'Access thousands of models from HuggingFace Hub',
    icon: Globe,
    apiKeyEnvVar: 'HUGGINGFACE_API_KEY',
    modelOptions: [], // Will be populated dynamically
    defaultModel: 'microsoft/DialoGPT-medium',
    isEnabled: false,
    color: 'yellow',
    type: 'remote',
    customModels: []
  },
  {
    id: 'custom',
    name: 'custom',
    displayName: 'Custom Models',
    description: 'Connect to your own fine-tuned models and custom endpoints',
    icon: Server,
    modelOptions: [], // Will be populated dynamically
    defaultModel: '',
    isEnabled: false,
    color: 'gray',
    type: 'custom',
    customModels: []
  }
];

export default function LLMSettingsPage() {
  const [providers, setProviders] = useState<LLMProviderConfig[]>(PROVIDERS);
  const [activeProvider, setActiveProvider] = useState<string>('anthropic');
  const [loading, setLoading] = useState(false);
  const [memoryWorkerStatus, setMemoryWorkerStatus] = useState<{
    connected: boolean;
    currentProvider: string;
    currentModel: string;
  } | null>(null);

  useEffect(() => {
    checkMemoryWorkerStatus();
    loadCurrentSettings();
    loadCustomModels();
  }, []);

  const loadCustomModels = async () => {
    try {
      // Load custom models
      const modelsResponse = await fetch('/api/admin/models');
      if (modelsResponse.ok) {
        const modelsData = await modelsResponse.json();
        const customModels = modelsData.models || [];

        // Load Ollama status
        const ollamaResponse = await fetch('/api/admin/ollama/status');
        const ollamaData = ollamaResponse.ok ? await ollamaResponse.json() : { available: false, models: [] };

        setProviders(prev => prev.map(provider => {
          if (provider.id === 'ollama') {
            return {
              ...provider,
              isEnabled: ollamaData.available,
              modelOptions: ollamaData.models?.map((m: any) => m.name) || [],
              customModels: customModels.filter((m: any) => m.provider === 'ollama')
            };
          } else if (provider.id === 'huggingface') {
            return {
              ...provider,
              customModels: customModels.filter((m: any) => m.provider === 'huggingface'),
              modelOptions: customModels.filter((m: any) => m.provider === 'huggingface').map((m: any) => m.name)
            };
          } else if (provider.id === 'custom') {
            return {
              ...provider,
              customModels: customModels.filter((m: any) => m.provider === 'custom'),
              modelOptions: customModels.filter((m: any) => m.provider === 'custom').map((m: any) => m.name),
              isEnabled: customModels.filter((m: any) => m.provider === 'custom').length > 0
            };
          }
          return provider;
        }));
      }
    } catch (error) {
      console.error('Error loading custom models:', error);
    }
  };

  const loadCurrentSettings = async () => {
    try {
      const response = await fetch('/api/admin/llm-status');
      if (response.ok) {
        const data = await response.json();
        
        setProviders(prev => prev.map(provider => {
          // Check if provider is enabled
          let isEnabled = data.availableProviders?.includes(provider.name) || false;
          
          // For non-API key providers, check different conditions
          if (provider.id === 'ollama') {
            // Ollama status will be updated by loadCustomModels
            return provider;
          } else if (provider.id === 'custom') {
            // Custom provider is enabled if there are custom models
            return provider;
          } else if (provider.id === 'huggingface') {
            // HuggingFace can work without API key for some models
            isEnabled = true;
          }
          
          return {
            ...provider,
            isEnabled,
            currentModel: data.providerConfigs?.[provider.name]?.model || provider.defaultModel
          };
        }));
        
        setActiveProvider(data.activeProvider || 'anthropic');
      }
    } catch (error) {
      console.error('Error loading LLM settings:', error);
    }
  };

  const checkMemoryWorkerStatus = async () => {
    try {
      const memoryWorkerUrl = process.env.NEXT_PUBLIC_MEMORY_WORKER_URL || 'http://localhost:3002';
      const response = await fetch(`${memoryWorkerUrl}/api/status`);
      
      if (response.ok) {
        const data = await response.json();
        setMemoryWorkerStatus({
          connected: true,
          currentProvider: data.llmProvider || 'unknown',
          currentModel: data.llmModel || 'unknown'
        });
      }
    } catch (error) {
      setMemoryWorkerStatus({
        connected: false,
        currentProvider: 'unknown',
        currentModel: 'unknown'
      });
    }
  };

  const handleProviderChange = async (providerId: string) => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/llm-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          activeProvider: providerId,
          action: 'setActiveProvider'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update provider');
      }

      const data = await response.json();
      
      setActiveProvider(providerId);
      
      if (data.memoryWorkerNotified) {
        toast.success(`Switched to ${providers.find(p => p.id === providerId)?.displayName}`);
      } else {
        toast.success(`Database updated to ${providers.find(p => p.id === providerId)?.displayName}`);
        if (data.memoryWorkerError) {
          toast.warning(`Memory worker not updated: ${data.memoryWorkerError}`);
        }
      }
      
      // Refresh memory worker status
      await checkMemoryWorkerStatus();
    } catch (error) {
      console.error('Error changing provider:', error);
      toast.error('Failed to change provider');
    } finally {
      setLoading(false);
    }
  };

  const handleModelChange = async (providerId: string, model: string) => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/llm-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: providerId,
          model: model,
          action: 'setModel'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update model');
      }

      const data = await response.json();

      setProviders(prev => prev.map(p => 
        p.id === providerId ? { ...p, currentModel: model } : p
      ));
      
      if (data.memoryWorkerNotified) {
        toast.success(`Updated ${providers.find(p => p.id === providerId)?.displayName} model to ${model}`);
      } else {
        toast.success(`Database updated: ${providers.find(p => p.id === providerId)?.displayName} model to ${model}`);
        if (data.memoryWorkerError) {
          toast.warning(`Memory worker not updated: ${data.memoryWorkerError}`);
        }
      }
      
      // Refresh memory worker status if this is the active provider
      if (providerId === activeProvider) {
        await checkMemoryWorkerStatus();
      }
    } catch (error) {
      console.error('Error changing model:', error);
      toast.error('Failed to update model');
    } finally {
      setLoading(false);
    }
  };

  const testProvider = async (providerId: string) => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/llm-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: providerId,
          testMessage: 'Hello, this is a test message. Please respond briefly.'
        }),
      });

      if (!response.ok) {
        throw new Error('Test failed');
      }

      const data = await response.json();
      toast.success(`Test successful! Response: "${data.response.substring(0, 50)}..."`);
    } catch (error) {
      console.error('Error testing provider:', error);
      toast.error('Provider test failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-500/20 rounded-lg">
          <Settings className="h-6 w-6 text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">LLM Provider Settings</h1>
          <p className="text-gray-400">Manage Maya's language model providers and configurations</p>
        </div>
      </div>

      {/* Memory Worker Status */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-400" />
            Memory Worker Status
          </CardTitle>
          <CardDescription className="text-gray-400">
            Connection status and current configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <span className="text-sm text-gray-400">Connection</span>
              <div className="flex items-center gap-2">
                {memoryWorkerStatus?.connected ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <span className="text-green-400 font-medium">Connected</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-red-400" />
                    <span className="text-red-400 font-medium">Disconnected</span>
                  </>
                )}
              </div>
              {!memoryWorkerStatus?.connected && (
                <p className="text-xs text-gray-500">
                  Memory worker not running on localhost:3002
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <span className="text-sm text-gray-400">Current Provider</span>
              <div className="text-white font-medium">
                {memoryWorkerStatus?.currentProvider || 'N/A'}
              </div>
            </div>
            
            <div className="space-y-2">
              <span className="text-sm text-gray-400">Current Model</span>
              <div className="text-white font-medium">
                {memoryWorkerStatus?.currentModel || 'N/A'}
              </div>
            </div>
          </div>
          
          {!memoryWorkerStatus?.connected && (
            <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-sm text-yellow-400 mb-2">
                <strong>Memory Worker Not Running:</strong> To use LLM provider switching, start the memory worker:
              </p>
              <code className="block p-3 bg-gray-800 rounded text-sm font-mono text-gray-300">
                cd packages/memory-worker && pnpm dev
              </code>
            </div>
          )}
          
          <Button
            onClick={checkMemoryWorkerStatus}
            variant="outline"
            size="sm"
            className="mt-4 border-gray-700 text-gray-300 hover:bg-gray-800"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh Status
          </Button>
        </CardContent>
      </Card>

      {/* Provider Configuration */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">LLM Providers</CardTitle>
          <CardDescription className="text-gray-400">
            Configure and switch between different language model providers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {providers.map((provider) => {
              const Icon = provider.icon;
              const isActive = activeProvider === provider.id;
              
              return (
                <Card key={provider.id} className={`bg-gray-800 border-gray-700 ${isActive ? 'ring-2 ring-purple-500/50' : ''}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-lg ${
                          provider.color === 'orange' ? 'bg-orange-500/20' :
                          provider.color === 'blue' ? 'bg-blue-500/20' :
                          provider.color === 'green' ? 'bg-green-500/20' :
                          provider.color === 'purple' ? 'bg-purple-500/20' :
                          provider.color === 'yellow' ? 'bg-yellow-500/20' :
                          'bg-gray-500/20'
                        }`}>
                          <Icon className={`h-6 w-6 ${
                            provider.color === 'orange' ? 'text-orange-400' :
                            provider.color === 'blue' ? 'text-blue-400' :
                            provider.color === 'green' ? 'text-green-400' :
                            provider.color === 'purple' ? 'text-purple-400' :
                            provider.color === 'yellow' ? 'text-yellow-400' :
                            'text-gray-400'
                          }`} />
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-semibold text-white">{provider.displayName}</h3>
                            <Badge variant={provider.isEnabled ? "default" : "secondary"} className={
                              provider.isEnabled 
                                ? "bg-green-500/20 text-green-400 border-green-500/30" 
                                : "bg-gray-700 text-gray-400 border-gray-600"
                            }>
                              {provider.isEnabled ? 'Available' : 'Not Configured'}
                            </Badge>
                            {isActive && (
                              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                                Active
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-400">{provider.description}</p>
                        </div>
                      </div>
                      
                      {provider.isEnabled && (
                        <div className="flex gap-2">
                          <Button
                            onClick={() => testProvider(provider.id)}
                            size="sm"
                            variant="outline"
                            className="border-green-600 text-green-400 hover:bg-green-600/10"
                            disabled={loading}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Test
                          </Button>
                          <Button
                            onClick={() => handleProviderChange(provider.id)}
                            size="sm"
                            className={`${isActive 
                              ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                            disabled={loading || isActive}
                          >
                            {isActive ? 'Active' : 'Use This'}
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {provider.isEnabled && (
                      <div className="space-y-4 mt-4">
                        {/* Model Selection */}
                        {provider.modelOptions.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-gray-300">
                                {provider.type === 'local' ? 'Available Models' : 'Model'}
                              </label>
                              <Select
                                value={provider.currentModel || provider.defaultModel}
                                onValueChange={(value) => handleModelChange(provider.id, value)}
                                disabled={loading}
                              >
                                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-800 border-gray-700">
                                  {provider.modelOptions.map((model) => (
                                    <SelectItem key={model} value={model} className="text-white hover:bg-gray-700">
                                      {model}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            
                            {provider.apiKeyEnvVar && (
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300">
                                  API Key Environment Variable
                                </label>
                                <div className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-400 text-sm font-mono">
                                  {provider.apiKeyEnvVar}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Custom Models Section */}
                        {(provider.customModels && provider.customModels.length > 0) && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-medium text-gray-300">
                                Configured Models ({provider.customModels.length})
                              </label>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-purple-600 text-purple-400 hover:bg-purple-600/10"
                                onClick={() => window.location.href = '/admin/model-manager'}
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                Manage
                              </Button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {provider.customModels.map((model: any) => (
                                <div key={model.id} className="p-3 bg-gray-700 rounded-lg">
                                  <div className="font-medium text-white text-sm">{model.name}</div>
                                  <div className="text-xs text-gray-400">{model.description}</div>
                                  {model.isLocal && (
                                    <Badge className="mt-1 text-xs bg-green-500/20 text-green-400 border-green-500/30">
                                      Local
                                    </Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Special Status for Local Providers */}
                        {provider.id === 'ollama' && (
                          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <Home className="h-4 w-4 text-blue-400" />
                              <span className="text-sm font-medium text-blue-400">Local Ollama Status</span>
                            </div>
                            <p className="text-sm text-gray-400">
                              {provider.modelOptions.length > 0 
                                ? `${provider.modelOptions.length} models available locally`
                                : 'No models installed. Use "ollama pull <model>" to install models.'
                              }
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {!provider.isEnabled && (
                      <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                        <p className="text-sm text-yellow-400">
                          {provider.id === 'ollama' && (
                            <>
                              Ollama is not running. Install Ollama from{' '}
                              <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                                ollama.ai
                              </a>{' '}
                              and start it locally.
                            </>
                          )}
                          {provider.id === 'custom' && (
                            <>
                              No custom models configured. Click{' '}
                              <button 
                                onClick={() => window.location.href = '/admin/model-manager'}
                                className="text-blue-400 hover:underline"
                              >
                                here
                              </button>{' '}
                              to add custom models.
                            </>
                          )}
                          {provider.apiKeyEnvVar && provider.id !== 'ollama' && provider.id !== 'custom' && (
                            <>
                              To enable this provider, set the{' '}
                              <code className="bg-gray-800 px-2 py-1 rounded text-yellow-300 font-mono">
                                {provider.apiKeyEnvVar}
                              </code>{' '}
                              environment variable and restart the application.
                            </>
                          )}
                          {provider.id === 'huggingface' && (
                            <>
                              HuggingFace models can work without an API key, but having one provides better access.
                              Configure models using the{' '}
                              <button 
                                onClick={() => window.location.href = '/admin/model-manager'}
                                className="text-blue-400 hover:underline"
                              >
                                Model Manager
                              </button>.
                            </>
                          )}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Prompt Editor and Logs */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Maya Configuration</CardTitle>
          <CardDescription className="text-gray-400">
            Customize Maya's personality and view response logs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="prompts" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-gray-800">
              <TabsTrigger value="prompts" className="data-[state=active]:bg-gray-700">
                Prompt Editor
              </TabsTrigger>
              <TabsTrigger value="logs" className="data-[state=active]:bg-gray-700">
                Response Logs
              </TabsTrigger>
            </TabsList>
            <TabsContent value="prompts" className="mt-6">
              <PromptEditor />
            </TabsContent>
            <TabsContent value="logs" className="mt-6">
              <LLMLogsViewer />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}