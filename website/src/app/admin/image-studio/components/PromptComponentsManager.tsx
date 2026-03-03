'use client'

import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'; 
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { PlusCircle, Edit3, Trash2, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
  ColumnFiltersState,
} from "@tanstack/react-table";

interface ImagePromptComponent {
  id: string;
  component_type: string;
  value: string;
  theme_tags?: string[] | null;
  weight?: number | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

type EditableImagePromptComponent = {
  component_type: string;
  value: string;
  theme_tags?: string[] | null;
  weight?: number | null;
  is_active?: boolean;
};

const MEMORY_WORKER_API_URL = process.env.NEXT_PUBLIC_MEMORY_WORKER_URL || 'http://localhost:3002';

const initialFormData: EditableImagePromptComponent = {
  component_type: '',
  value: '',
  theme_tags: [],
  weight: 1,
  is_active: true,
};

// This is now a reusable component, not a default export page
export function PromptComponentsManager() { 
  const [components, setComponents] = useState<ImagePromptComponent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<ImagePromptComponent | null>(null);
  const [formData, setFormData] = useState<EditableImagePromptComponent>(initialFormData);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/image-gen/prompt-components`);
      if (!res.ok) throw new Error('Failed to fetch components');
      const data = await res.json();
      setComponents(data || []);
    } catch (error: any) {
      toast.error(error.message || 'Could not load components.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const target = e.target as HTMLInputElement;
    if (target.type === 'checkbox') {
        setFormData(prev => ({ ...prev, [name]: target.checked }));
    } else if (target.type === 'number') {
        setFormData(prev => ({ ...prev, [name]: value === '' ? null : Number(value) }));
    } else {
        setFormData(prev => ({ ...prev, [name]: value }));
    }
  };
  
  const handleThemeTagsChange = (value: string) => {
    const tags = value.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
    setFormData(prev => ({ ...prev, theme_tags: tags.length > 0 ? tags : null }));
  };

  const openDialog = (component: ImagePromptComponent | null = null) => {
    console.log("[PromptComponentsManager] openDialog called. Component:", component);
    setEditingComponent(component);
    if (component) {
      setFormData({
        component_type: component.component_type,
        value: component.value,
        theme_tags: component.theme_tags || [],
        weight: component.weight === undefined || component.weight === null ? 1 : component.weight,
        is_active: component.is_active === undefined ? true : component.is_active,
      });
    } else {
      setFormData(initialFormData);
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData.component_type?.trim() || !formData.value?.trim()) {
        toast.error("Component Type and Value are required.");
        return;
    }
    setIsSubmitting(true);
    const url = editingComponent 
      ? `${MEMORY_WORKER_API_URL}/api/v1/image-gen/prompt-components/${editingComponent.id}` 
      : `${MEMORY_WORKER_API_URL}/api/v1/image-gen/prompt-components`;
    const method = editingComponent ? 'PUT' : 'POST';
    try {
      const payload: EditableImagePromptComponent = { ...formData }; 
      if (payload.weight === null || payload.weight === undefined) {
        payload.weight = 1; 
      } else {
        payload.weight = Number(payload.weight);
      }
      if (!Array.isArray(payload.theme_tags) || payload.theme_tags.length === 0) {
          payload.theme_tags = null;
      } else {
          payload.theme_tags = payload.theme_tags.map(tag => String(tag).trim()).filter(tag => tag !== '');
          if (payload.theme_tags.length === 0) payload.theme_tags = null;
      }
      payload.is_active = Boolean(formData.is_active === undefined ? true : formData.is_active);

      console.log("[PromptComponentsManager] Frontend payload for " + method + ":", JSON.stringify(payload, null, 2));

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const responseData = await response.json();
      if (!response.ok) throw new Error(responseData.error || `Failed to ${editingComponent ? 'update' : 'create'} component`);
      toast.success(`Component ${editingComponent ? 'updated' : 'created'} successfully!`);
      fetchData(); 
      setIsDialogOpen(false);
    } catch (error: any) { 
      console.error(`Error during ${method} component:`, error);
      toast.error(error.message); 
    } 
    finally { setIsSubmitting(false); }
  };
  
  const handleToggleActive = async (component: ImagePromptComponent) => {
    setIsSubmitting(true);
    const currentActiveState = component.is_active === undefined ? true : component.is_active;
    const newActiveState = !currentActiveState;
    try {
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/image-gen/prompt-components/${component.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newActiveState }),
      });
      const responseData = await response.json();
      if (!response.ok) throw new Error(responseData.error || 'Failed to update active state');
      toast.success(`Component ${newActiveState ? 'activated' : 'deactivated'}`);
      fetchData();
    } catch (error: any) { toast.error(error.message); }
    finally { setIsSubmitting(false); }
  };

  const columns: ColumnDef<ImagePromptComponent>[] = [
    { accessorKey: "component_type", header: "Type", cell: ({ row }) => <div className="capitalize font-medium text-purple-300">{(row.getValue("component_type") as string || '').replace(/_/g, ' ')}</div>,},
    { accessorKey: "value", header: "Value", cell: ({ row }) => <div className="line-clamp-3" title={row.getValue("value") as string}>{(row.getValue("value") as string || '')}</div>,},
    { accessorKey: "theme_tags", header: "Themes", cell: ({ row }) => { const tags = row.getValue("theme_tags") as string[] | null; return tags && tags.length > 0 ? <div className="text-xs text-gray-400">{tags.join(', ')}</div> : <span className="text-xs text-gray-500">-</span>; },},
    { accessorKey: "weight", header: "Weight", cell: ({ row }) => (row.getValue("weight") as number ?? 1),},
    { accessorKey: "is_active", header: "Active", cell: ({ row }) => { const isActive = row.getValue("is_active") === undefined ? true : Boolean(row.getValue("is_active")); return (<Switch checked={isActive} onCheckedChange={() => handleToggleActive(row.original)} disabled={isSubmitting}/> );},},
    {
      id: "actions", 
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => { 
        const component = row.original;
        return (
          <div className="text-right space-x-2">
            <Button variant="outline" size="sm" onClick={() => openDialog(component)} disabled={isSubmitting} className="h-8 w-8 p-0"><Edit3 className="h-3.5 w-3.5" /></Button>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="destructive" size="sm" disabled={isSubmitting} className="h-8 w-8 p-0"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
              <AlertDialogContent className="bg-gray-900 border-gray-800 text-gray-100">
                <AlertDialogHeader><AlertDialogTitle>Delete: {component.value.substring(0,30)}...?</AlertDialogTitle><AlertDialogDescription className="text-gray-400">Cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={async () => {
                     setIsSubmitting(true); 
                     try { 
                         const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/image-gen/prompt-components/${component.id}`, { method: 'DELETE' }); 
                         if (!response.ok && response.status !== 204) { const errData = await response.json().catch(()=>{}); throw new Error(errData.error || 'Delete failed');} 
                         toast.success('Deleted!'); fetchData();
                     } catch (err:any) { toast.error(err.message); } 
                     finally { setIsSubmitting(false); }
                  }} className="bg-red-600 hover:bg-red-700">Yes, delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data: components, columns, state: { sorting, columnFilters },
    onSortingChange: setSorting, onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(),
  });

  if (isLoading && components.length === 0) {
    return <div className="flex justify-center items-center min-h-[40vh]"><Loader2 className="h-10 w-10 animate-spin text-purple-400" /><p className="ml-3 text-gray-400">Loading components...</p></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        {/* Title moved to parent TabsTrigger */}
        <div className="flex items-center space-x-2">
            <Input placeholder="Filter by Type..." value={String(table.getColumn("component_type")?.getFilterValue() || "")} onChange={(e) => table.getColumn("component_type")?.setFilterValue(e.target.value)} className="h-9 max-w-xs bg-gray-800 border-gray-700"/>
            <Input placeholder="Filter by Value..." value={String(table.getColumn("value")?.getFilterValue() || "")} onChange={(e) => table.getColumn("value")?.setFilterValue(e.target.value)} className="h-9 max-w-xs bg-gray-800 border-gray-700"/>
        </div>
        <div className="flex items-center space-x-2">
            <Button variant="outline" size="icon" onClick={() => fetchData()} disabled={isLoading} className="h-9 w-9"><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /></Button>
            <Button onClick={() => openDialog()} className="bg-blue-600 hover:bg-blue-700"><PlusCircle className="mr-2 h-4 w-4"/> Add Component</Button>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-gray-900 border-gray-700 text-gray-100">
          <DialogHeader><DialogTitle>{editingComponent ? 'Edit' : 'Create'} Prompt Component</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-3 py-4">
            <div className="grid grid-cols-4 items-center gap-3">
              <Label htmlFor="component_type" className="text-right">Type</Label>
              <Input id="component_type" name="component_type" value={formData.component_type || ''} onChange={handleInputChange} className="col-span-3 bg-gray-800" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label htmlFor="value" className="text-right">Value</Label>
              <Textarea id="value" name="value" value={formData.value || ''} onChange={handleInputChange} className="col-span-3 bg-gray-800 min-h-[60px]" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label htmlFor="theme_tags" className="text-right">Theme Tags</Label>
              <Input id="theme_tags" name="theme_tags" value={formData.theme_tags?.join(', ') || ''} onChange={(e) => handleThemeTagsChange(e.target.value)} className="col-span-3 bg-gray-800" placeholder="comma-separated" />
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label htmlFor="weight" className="text-right">Weight</Label>
              <Input id="weight" name="weight" type="number" value={formData.weight === null ? '' : formData.weight || '1'} onChange={handleInputChange} className="col-span-3 bg-gray-800" />
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label htmlFor="is_active_comp" className="text-right">Active</Label>
              <div className="col-span-3">
                <Switch id="is_active_comp" name="is_active" checked={formData.is_active === undefined ? true : formData.is_active} onCheckedChange={(cs) => setFormData(p => ({...p, is_active:Boolean(cs)}))} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline" disabled={isSubmitting}>Cancel</Button></DialogClose>
              <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} {editingComponent ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      <div className="rounded-md border border-gray-700 bg-gray-900/30">
        <Table>
          <TableHeader>{table.getHeaderGroups().map(hg => (<TableRow key={hg.id} className="border-gray-700 hover:bg-gray-800/40">{hg.headers.map(h => <TableHead key={h.id} className="text-gray-300 font-semibold">{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableHead>)}</TableRow>))}</TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? table.getRowModel().rows.map(row => (
              <TableRow key={row.id} data-state={row.getIsSelected() && "selected"} className="border-gray-800 hover:bg-gray-800/60">
                {row.getVisibleCells().map(cell => <TableCell key={cell.id} className="py-2 px-3 text-gray-200 text-xs">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
              </TableRow>
            )) : (<TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-gray-400">No components found.</TableCell></TableRow>)}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-2 text-gray-300">
        <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage() || isSubmitting}>Previous</Button>
        <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage() || isSubmitting}>Next</Button>
      </div>
    </div>
  );
} 