'use client'

import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, Settings2, Film, ToyBrick, Layers } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PromptComponentsManager } from './components/PromptComponentsManager';
import { SeriesVariationsManager } from './components/SeriesVariationsManager';
import { useMediaQuery } from "@/hooks/use-media-query";

// Define the expected structure of the API response for a single image generation
interface SingleImageResponse {
  message: string;
  details?: {
    prompt: string;
    mood_id: string;
    // Potentially other details if the API returns more, like the feed_item_id created
  };
  // If the API directly returns image_url or feed_item_id upon queuing, add them here.
  // For now, assuming it just returns an acceptance message.
}

interface ImagePromptComponent {
  id: string;
  component_type: string;
  value: string;
  theme_tags?: string[] | null;
  weight?: number;
}

interface PromptStructureResponse {
  image_prompt_structure: string[];
  error?: string;
}

export default function ImageStudioPage() {
  const [promptStructure, setPromptStructure] = useState<string[]>([]);
  const [promptComponents, setPromptComponents] = useState<ImagePromptComponent[]>([]);
  const [selectedComponentValues, setSelectedComponentValues] = useState<Record<string, string>>({});
  const [manualComponentValues, setManualComponentValues] = useState<Record<string, string>>({});
  const [finalConstructedPrompt, setFinalConstructedPrompt] = useState<string>('');
  
  const [moodId, setMoodId] = useState<string>('studio_manual_test');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [lastGeneratedPrompt, setLastGeneratedPrompt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("playground");

  // New state for Series Generation UI
  const [variationSetNames, setVariationSetNames] = useState<string[]>([]);
  const [selectedVariationSetName, setSelectedVariationSetName] = useState<string>('');
  const [availableVariationTypesForSet, setAvailableVariationTypesForSet] = useState<string[]>([]);
  const [selectedVariationTypes, setSelectedVariationTypes] = useState<string[]>([]);
  const [isLoadingSeriesConfig, setIsLoadingSeriesConfig] = useState(false);
  const [isGeneratingSeries, setIsGeneratingSeries] = useState(false);

  // Check if device is mobile
  const isMobile = useMediaQuery("(max-width: 768px)");

  // The URL for your series-generator service API endpoint
  // Ensure this is correctly configured in your environment variables for production
  const SERIES_GENERATOR_API_URL = process.env.NEXT_PUBLIC_SERIES_GENERATOR_URL || 'http://localhost:8009'; 
  const MEMORY_WORKER_API_URL = process.env.NEXT_PUBLIC_MEMORY_WORKER_URL || 'http://localhost:3002';
  const router = useRouter();

  const fetchPromptConfig = useCallback(async () => {
    setIsLoadingConfig(true);
    setIsLoadingSeriesConfig(true); // Also set this for initial load
    try {
      const [structureRes, componentsRes, varSetNamesRes] = await Promise.all([
        fetch(`${MEMORY_WORKER_API_URL}/api/v1/image-gen/prompt-structure`),
        fetch(`${MEMORY_WORKER_API_URL}/api/v1/image-gen/prompt-components`),
        fetch(`${MEMORY_WORKER_API_URL}/api/v1/image-gen/variation-set-names`) // Fetch set names
      ]);

      if (!structureRes.ok) throw new Error('Failed to fetch prompt structure');
      const structureData: PromptStructureResponse = await structureRes.json();
      setPromptStructure(structureData.image_prompt_structure && structureData.image_prompt_structure.length > 0 
        ? structureData.image_prompt_structure 
        : ['character_style', 'character_details', 'clothing', 'setting', 'art_style']);

      if (!componentsRes.ok) throw new Error('Failed to fetch prompt components');
      const componentsData: ImagePromptComponent[] = await componentsRes.json();
      setPromptComponents(componentsData || []);

      if (!varSetNamesRes.ok) throw new Error('Failed to fetch variation set names');
      const varSetNamesData: string[] = await varSetNamesRes.json();
      setVariationSetNames(varSetNamesData || []);
      if (varSetNamesData && varSetNamesData.length > 0) {
        setSelectedVariationSetName(varSetNamesData[0]); // Select first by default
      }

    } catch (error: any) {
      console.error("Error fetching initial configurations:", error);
      toast.error(error.message || 'Failed to load configurations.');
      if (promptStructure.length === 0) {
         setPromptStructure(['character_style', 'character_details', 'clothing', 'setting', 'art_style']);
      }
    } finally {
      setIsLoadingConfig(false);
      setIsLoadingSeriesConfig(false);
    }
  }, [MEMORY_WORKER_API_URL, promptStructure.length]);

  useEffect(() => {
    fetchPromptConfig();
  }, []); // Fetch only on mount

  // Fetch variation types when selectedVariationSetName changes
  useEffect(() => {
    if (selectedVariationSetName) {
      const fetchTypes = async () => {
        setIsLoadingSeriesConfig(true);
        try {
          const res = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/image-gen/variation-types?set_name=${encodeURIComponent(selectedVariationSetName)}`);
          if (!res.ok) throw new Error('Failed to fetch variation types for set');
          const typesData: string[] = await res.json();
          setAvailableVariationTypesForSet(typesData || []);
          setSelectedVariationTypes([]); // Reset selected types when set changes
        } catch (error: any) {
          console.error("Error fetching variation types:", error);
          toast.error(error.message || 'Failed to load variation types.');
          setAvailableVariationTypesForSet([]);
        } finally {
          setIsLoadingSeriesConfig(false);
        }
      };
      fetchTypes();
    }
  }, [selectedVariationSetName, MEMORY_WORKER_API_URL]);

  useEffect(() => {
    // Construct the final prompt whenever selectedComponentValues or manualComponentValues change
    const parts: string[] = [];
    promptStructure.forEach(type => {
      const manualValue = manualComponentValues[type]?.trim();
      const selectedValue = selectedComponentValues[type];
      if (manualValue) {
        parts.push(manualValue);
      } else if (selectedValue && selectedValue !== '--none--' && selectedValue !== '--manual--') {
        parts.push(selectedValue);
      }
    });
    setFinalConstructedPrompt(parts.filter(Boolean).join(', '));
  }, [selectedComponentValues, manualComponentValues, promptStructure]);

  const handleComponentChange = (componentType: string, value: string) => {
    if (value === '--manual--') {
      setSelectedComponentValues(prev => ({ ...prev, [componentType]: value }));
      // Do not clear manualComponentValues[componentType] here, let user type
    } else if (value === '--none--') {
      setSelectedComponentValues(prev => ({ ...prev, [componentType]: value }));
      setManualComponentValues(prev => ({ ...prev, [componentType]: '' })); // Clear manual input
    } else {
      setSelectedComponentValues(prev => ({ ...prev, [componentType]: value }));
      setManualComponentValues(prev => ({ ...prev, [componentType]: '' })); // Clear manual input
    }
  };

  const handleManualInputChange = (componentType: string, value: string) => {
    setManualComponentValues(prev => ({ ...prev, [componentType]: value }));
  };

  const handleGenerateImage = async () => {
    if (!finalConstructedPrompt.trim()) {
      toast.error('Prompt cannot be empty. Select or enter some components.');
      return;
    }
    setIsLoading(true);
    setLastGeneratedPrompt(finalConstructedPrompt);

    try {
      const response = await fetch(`${SERIES_GENERATOR_API_URL}/generate-single-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: finalConstructedPrompt, mood_id: moodId }),
      });
      const responseData: SingleImageResponse = await response.json();
      if (!response.ok) throw new Error(responseData.message || 'Failed to start image generation.');
      toast.success(responseData.message || 'Image generation task accepted! Check feed.');
    } catch (error: any) {
      console.error("Error generating image:", error);
      toast.error(error.message || 'An error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateSeriesFromStudio = async () => {
    if (!finalConstructedPrompt.trim()) {
      toast.error('Base prompt cannot be empty for series generation.');
      return;
    }
    if (!selectedVariationSetName) {
      toast.error('Please select a variation set.');
      return;
    }
    if (selectedVariationTypes.length === 0) {
      toast.error('Please select at least one variation type to apply.');
      return;
    }

    setIsGeneratingSeries(true);
    setLastGeneratedPrompt(finalConstructedPrompt + ` (Series: ${selectedVariationSetName})`);

    const base_raw_components: {component_type: string, value: string}[] = [];
    promptStructure.forEach(type => {
      const manualValue = manualComponentValues[type]?.trim();
      const selectedValue = selectedComponentValues[type];
      if (manualValue) {
        base_raw_components.push({ component_type: type, value: manualValue });
      } else if (selectedValue && selectedValue !== '--none--' && selectedValue !== '--manual--') {
        base_raw_components.push({ component_type: type, value: selectedValue });
      }
    });

    try {
      const response = await fetch(`${SERIES_GENERATOR_API_URL}/generate-series-from-components`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_raw_components,
          base_mood_id: moodId, // Use the same moodId as single image for now
          variation_set_name: selectedVariationSetName,
          variation_types_to_apply: selectedVariationTypes,
        }),
      });
      const responseData: any = await response.json();
      if (!response.ok) throw new Error(responseData.message || 'Failed to start series generation.');
      toast.success(responseData.message || 'Series generation task accepted! New items will appear in feed.');
    } catch (error: any) {
      console.error("Error generating series:", error);
      toast.error(error.message || 'An error occurred while generating series.');
    } finally {
      setIsGeneratingSeries(false);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };

  if (isLoadingConfig) {
    return (
      <div className="container mx-auto p-4 md:p-6 flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-12 w-12 animate-spin text-purple-400" />
        <p className="ml-4 text-lg text-gray-300">Loading Studio Config...</p>
      </div>
    );
  }
  
  if (promptStructure.length === 0 && !isLoadingConfig) {
     return (
      <div className="container mx-auto p-4 md:p-6 flex flex-col justify-center items-center min-h-[60vh] text-center">
        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-xl text-red-400">Failed to Load Prompt Configuration</p>
        <p className="text-gray-400">Could not load vital configuration for the prompt builder. Please try refreshing.</p>
        <Button onClick={fetchPromptConfig} className="mt-4">Retry</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 pb-20 md:pb-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-500 to-teal-400 bg-clip-text text-transparent pb-2">
          Image Studio
        </h1>
      </div>

      {!isMobile && (
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-gray-800/80">
            <TabsTrigger value="playground" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"><Settings2 className="mr-2 h-4 w-4 inline-block"/>Playground</TabsTrigger>
            <TabsTrigger value="components" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"><ToyBrick className="mr-2 h-4 w-4 inline-block"/>Prompt Components</TabsTrigger>
            <TabsTrigger value="variations" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"><Layers className="mr-2 h-4 w-4 inline-block"/>Series Variations</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {activeTab === "playground" && (
        <div className="mt-6">
          {/* Constructed Prompt Card - Moved to top */}
          <Card className="bg-gray-900 border-gray-700 shadow-lg mb-6">
            <CardHeader>
              <CardTitle className="text-gray-100">Constructed Prompt</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea 
                value={finalConstructedPrompt}
                readOnly
                className="min-h-[120px] bg-gray-800/50 border-gray-700 text-gray-200 font-mono text-sm"
                placeholder="Prompt will appear here as you select components..."
              />
            </CardContent>
            <CardFooter>
              <Button 
                onClick={handleGenerateImage} 
                disabled={isLoading || isGeneratingSeries || !finalConstructedPrompt.trim()} 
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating Single...</> : 'Generate Single Image'}
              </Button>
            </CardFooter>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left Panel: Controls */}
            <Card className="md:col-span-1 bg-gray-900 border-gray-700 shadow-lg h-fit">
              <CardHeader>
                <CardTitle className="text-gray-100">Prompt Builder & Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {promptStructure.map((componentType) => {
                  const availableOptions = promptComponents.filter(c => c.component_type === componentType);
                  return (
                    <div key={componentType} className="space-y-1.5">
                      <Label htmlFor={`select-${componentType}`} className="text-gray-300 capitalize">{componentType.replace(/_/g, ' ')}</Label>
                      <Select 
                        value={selectedComponentValues[componentType] || '--none--'}
                        onValueChange={(value) => handleComponentChange(componentType, value)}
                        disabled={isLoading || isGeneratingSeries}
                      >
                        <SelectTrigger id={`select-${componentType}`} className="bg-gray-800 border-gray-600 text-gray-100 focus:border-blue-500">
                          <SelectValue placeholder={`Select ${componentType.replace(/_/g, ' ')}...`} />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-gray-700 text-gray-100">
                          <SelectItem value="--none--">-- None --</SelectItem>
                          {availableOptions.map(opt => (
                            <SelectItem key={opt.id || opt.value} value={opt.value}>{opt.value}</SelectItem>
                          ))}
                          <SelectItem value="--manual--">-- Manual Input --</SelectItem>
                        </SelectContent>
                      </Select>
                      {selectedComponentValues[componentType] === '--manual--' && (
                        <Textarea
                          placeholder={`Manually enter ${componentType.replace(/_/g, ' ')}...`}
                          value={manualComponentValues[componentType] || ''}
                          onChange={(e) => handleManualInputChange(componentType, e.target.value)}
                          className="min-h-[60px] bg-gray-800/70 border-gray-600 text-gray-100 focus:border-blue-500 mt-1"
                          disabled={isLoading || isGeneratingSeries}
                        />
                      )}
                    </div>
                  );
                })}
                <div className="space-y-1.5 pt-2">
                  <Label htmlFor="moodId" className="text-gray-300">Context/Mood ID</Label>
                  <Input 
                    type="text" id="moodId" placeholder="e.g., studio_test"
                    value={moodId} onChange={(e) => setMoodId(e.target.value)}
                    className="bg-gray-800 border-gray-600 text-gray-100 focus:border-blue-500"
                    disabled={isLoading || isGeneratingSeries}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Right Panel: Series Generation */}
            <div className="md:col-span-2 space-y-6">
              {/* New Card for Series Generation Controls */}
              <Card className="bg-gray-900 border-gray-700 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-gray-100 flex items-center"><Film className="mr-2 h-5 w-5 text-purple-400"/>Generate Series from Above Prompt</CardTitle>
                  <CardDescription className="text-gray-400">Select a variation set and types to generate multiple images based on the constructed prompt.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="variationSetName" className="text-gray-300">Variation Set</Label>
                    <Select 
                      value={selectedVariationSetName}
                      onValueChange={setSelectedVariationSetName}
                      disabled={isGeneratingSeries || isLoadingSeriesConfig || variationSetNames.length === 0}
                    >
                      <SelectTrigger id="variationSetName" className="bg-gray-800 border-gray-600 text-gray-100 focus:border-blue-500">
                        <SelectValue placeholder="Select a variation set..." />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700 text-gray-100">
                        {variationSetNames.length === 0 && <SelectItem value="loading" disabled>Loading sets...</SelectItem>}
                        {variationSetNames.map(name => (
                          <SelectItem key={name} value={name}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedVariationSetName && availableVariationTypesForSet.length > 0 && (
                    <div>
                      <Label className="text-gray-300 mb-1 block">Apply Variation Types:</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 p-2 rounded-md bg-gray-800/30">
                        {availableVariationTypesForSet.map(type => (
                          <div key={type} className="flex items-center space-x-2">
                            <Checkbox 
                              id={`type-${type}`} 
                              checked={selectedVariationTypes.includes(type)}
                              onCheckedChange={(checked) => {
                                setSelectedVariationTypes(prev => 
                                  checked ? [...prev, type] : prev.filter(t => t !== type)
                                );
                              }}
                              disabled={isGeneratingSeries}
                            />
                            <Label htmlFor={`type-${type}`} className="text-sm font-medium text-gray-300 capitalize cursor-pointer">{type.replace(/_/g, ' ')}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedVariationSetName && availableVariationTypesForSet.length === 0 && !isLoadingSeriesConfig && (
                     <p className="text-xs text-yellow-400 italic">No variation types found for selected set or still loading.</p>
                  )}
                  <Button onClick={handleGenerateSeriesFromStudio} disabled={isGeneratingSeries || isLoading || !finalConstructedPrompt.trim() || !selectedVariationSetName || selectedVariationTypes.length === 0} className="w-full bg-purple-600 hover:bg-purple-700">
                    {isGeneratingSeries ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating Series...</> : 'Generate Series from Prompt'}
                  </Button>
                </CardContent>
              </Card>
              
              {lastGeneratedPrompt && (
                <Card className="bg-gray-900 border-gray-700 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-gray-100">Last Generation Attempt</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-gray-400">Using Prompt: <span className="text-gray-200 font-mono">{lastGeneratedPrompt}</span></p>
                    <p className="text-sm text-gray-400">
                      Image will appear in the main <a href="/admin/feed" className="underline text-blue-400 hover:text-blue-300">Activity Feed</a> once processed.
                    </p>
                    <Button variant="outline" onClick={() => router.push('/admin/feed')}>Go to Feed</Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "components" && (
        <div className="mt-6">
          <PromptComponentsManager />
        </div>
      )}

      {activeTab === "variations" && (
        <div className="mt-6">
          <SeriesVariationsManager />
        </div>
      )}

      {/* Mobile bottom navigation */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 z-50">
          <div className="grid grid-cols-3 h-16">
            <button
              onClick={() => handleTabChange("playground")}
              className={`flex flex-col items-center justify-center space-y-1 ${
                activeTab === "playground" ? "text-blue-400" : "text-gray-400"
              }`}
            >
              <Settings2 className="h-5 w-5" />
              <span className="text-xs font-medium">Playground</span>
            </button>
            <button
              onClick={() => handleTabChange("components")}
              className={`flex flex-col items-center justify-center space-y-1 ${
                activeTab === "components" ? "text-blue-400" : "text-gray-400"
              }`}
            >
              <ToyBrick className="h-5 w-5" />
              <span className="text-xs font-medium">Components</span>
            </button>
            <button
              onClick={() => handleTabChange("variations")}
              className={`flex flex-col items-center justify-center space-y-1 ${
                activeTab === "variations" ? "text-blue-400" : "text-gray-400"
              }`}
            >
              <Layers className="h-5 w-5" />
              <span className="text-xs font-medium">Variations</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 