'use client'

import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox'; // Keep for consistency, though form uses Switch for is_active
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

interface ImageSeriesVariation {
  id: string;
  variation_set_name: string;
  variation_type: string;
  value: string;
  description?: string | null;
  theme_tags?: string[] | null;
  weight?: number | null;
  mutually_exclusive_group?: string | null;
  applies_to_component_type?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

type EditableSeriesVariation = Omit<ImageSeriesVariation, 'id' | 'created_at' | 'updated_at'>;

const MEMORY_WORKER_API_URL = process.env.NEXT_PUBLIC_MEMORY_WORKER_URL || 'http://localhost:3002';

const initialVariationFormData: EditableSeriesVariation = {
  variation_set_name: '',
  variation_type: '',
  value: '',
  description: null,
  theme_tags: [],
  weight: 1,
  mutually_exclusive_group: null,
  applies_to_component_type: null,
  is_active: true,
};

export function SeriesVariationsManager() { 
  const [variations, setVariations] = useState<ImageSeriesVariation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVariation, setEditingVariation] = useState<ImageSeriesVariation | null>(null);
  const [formData, setFormData] = useState<EditableSeriesVariation>(initialVariationFormData);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/image-gen/series-variations`);
      if (!res.ok) throw new Error('Failed to fetch series variations');
      const data = await res.json();
      setVariations(data || []);
    } catch (error: any) {
      toast.error(error.message || 'Could not load series variations.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const target = e.target as HTMLInputElement;
    if (target.type === 'number') {
        setFormData(prev => ({ ...prev, [name]: value === '' ? null : Number(value) }));
    } else {
        setFormData(prev => ({ ...prev, [name]: value }));
    }
  };
  
  const handleThemeTagsChange = (value: string) => {
    const tags = value.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
    setFormData(prev => ({ ...prev, theme_tags: tags.length > 0 ? tags : null }));
  };

  const openDialog = (variation: ImageSeriesVariation | null = null) => {
    setEditingVariation(variation);
    if (variation) {
      setFormData({
        variation_set_name: variation.variation_set_name,
        variation_type: variation.variation_type,
        value: variation.value,
        description: variation.description || null,
        theme_tags: variation.theme_tags || [],
        weight: variation.weight === undefined || variation.weight === null ? 1 : variation.weight,
        mutually_exclusive_group: variation.mutually_exclusive_group || null,
        applies_to_component_type: variation.applies_to_component_type || null,
        is_active: variation.is_active === undefined ? true : variation.is_active,
      });
    } else {
      setFormData(initialVariationFormData);
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData.variation_set_name?.trim() || !formData.variation_type?.trim() || !formData.value?.trim()) {
        toast.error("Set Name, Type, and Value are required.");
        return;
    }
    setIsSubmitting(true);
    const url = editingVariation 
      ? `${MEMORY_WORKER_API_URL}/api/v1/image-gen/series-variations/${editingVariation.id}` 
      : `${MEMORY_WORKER_API_URL}/api/v1/image-gen/series-variations`;
    const method = editingVariation ? 'PUT' : 'POST';
    try {
      const payload = { ...formData };
      if (payload.weight === undefined || payload.weight === null) payload.weight = 1; 
      else payload.weight = Number(payload.weight);
      if (!Array.isArray(payload.theme_tags)) payload.theme_tags = null;

      const response = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const responseData = await response.json();
      if (!response.ok) throw new Error(responseData.error || `Failed to ${editingVariation ? 'update' : 'create'} variation`);
      toast.success(`Variation ${editingVariation ? 'updated' : 'created'} successfully!`);
      fetchData(); 
      setIsDialogOpen(false);
    } catch (error: any) { toast.error(error.message); } 
    finally { setIsSubmitting(false); }
  };
  
  const handleToggleActive = async (variation: ImageSeriesVariation) => {
    setIsSubmitting(true);
    const currentActiveState = variation.is_active === undefined ? true : variation.is_active;
    const newActiveState = !currentActiveState;
    try {
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/image-gen/series-variations/${variation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newActiveState }),
      });
      const responseData = await response.json();
      if (!response.ok) throw new Error(responseData.error || 'Failed to update active state');
      toast.success(`Variation ${newActiveState ? 'activated' : 'deactivated'}`);
      fetchData();
    } catch (error: any) { toast.error(error.message); }
    finally { setIsSubmitting(false); }
  };

  const columns: ColumnDef<ImageSeriesVariation>[] = [
    { accessorKey: "variation_set_name", header: "Set Name", cell: ({row}) => <div className="font-medium text-sky-300">{row.getValue("variation_set_name")}</div> },
    { accessorKey: "variation_type", header: "Type", cell: ({row}) => <div className="capitalize">{(row.getValue("variation_type") as string || '').replace(/_/g, ' ')}</div> },
    { accessorKey: "value", header: "Value", cell: ({row}) => <div className="line-clamp-2 max-w-xs" title={row.getValue("value") as string}>{(row.getValue("value") as string || '')}</div> },
    { accessorKey: "applies_to_component_type", header: "Applies To", cell: ({row}) => (row.getValue("applies_to_component_type") as string || 'N/A') },
    { accessorKey: "theme_tags", header: "Themes", cell: ({row}) => { const tags = row.getValue("theme_tags") as string[] | null; return tags && tags.length > 0 ? tags.join(', ') : '-'; } },
    { accessorKey: "is_active", header: "Active", cell: ({row}) => { const isActive = row.getValue("is_active") === undefined ? true : Boolean(row.getValue("is_active")); return (<Switch checked={isActive} onCheckedChange={() => handleToggleActive(row.original)} disabled={isSubmitting}/> );},},
    {
      id: "actions", header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const variation = row.original;
        return (
          <div className="text-right space-x-2">
            <Button variant="outline" size="sm" onClick={() => openDialog(variation)} disabled={isSubmitting} className="h-8 w-8 p-0"><Edit3 className="h-3.5 w-3.5" /></Button>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="destructive" size="sm" disabled={isSubmitting} className="h-8 w-8 p-0"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
              <AlertDialogContent className="bg-gray-900 border-gray-800 text-gray-100">
                <AlertDialogHeader><AlertDialogTitle>Delete: {variation.value.substring(0,30)}...?</AlertDialogTitle><AlertDialogDescription className="text-gray-400">Cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={async () => {
                     setIsSubmitting(true); 
                     try { 
                         const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/image-gen/series-variations/${variation.id}`, { method: 'DELETE' }); 
                         if (!response.ok && response.status !== 204) { const errData = await response.json().catch(()=>{}); throw new Error(errData.error || 'Delete failed');} 
                         toast.success('Variation deleted!'); fetchData();
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
    data: variations, columns, state: { sorting, columnFilters },
    onSortingChange: setSorting, onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(),
  });

  if (isLoading && variations.length === 0) {
    return <div className="flex justify-center items-center min-h-[40vh]"><Loader2 className="h-10 w-10 animate-spin text-teal-400" /><p className="ml-3 text-gray-400">Loading variations...</p></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
            <Input placeholder="Filter by Set Name..." value={String(table.getColumn("variation_set_name")?.getFilterValue() || "")} onChange={(e) => table.getColumn("variation_set_name")?.setFilterValue(e.target.value)} className="h-9 max-w-xs bg-gray-800 border-gray-700"/>
            <Input placeholder="Filter by Type..." value={String(table.getColumn("variation_type")?.getFilterValue() || "")} onChange={(e) => table.getColumn("variation_type")?.setFilterValue(e.target.value)} className="h-9 max-w-xs bg-gray-800 border-gray-700"/>
        </div>
        <div className="flex items-center space-x-2">
            <Button variant="outline" size="icon" onClick={() => fetchData()} disabled={isLoading} className="h-9 w-9"><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /></Button>
            <Button onClick={() => openDialog()} className="bg-cyan-600 hover:bg-cyan-700"><PlusCircle className="mr-2 h-4 w-4"/> Add Variation</Button>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-gray-900 border-gray-700 text-gray-100">
          <DialogHeader><DialogTitle>{editingVariation ? 'Edit' : 'Create'} Series Variation</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-3 py-4">
            <div className="grid grid-cols-4 items-center gap-3"><Label htmlFor="variation_set_name" className="text-right">Set Name</Label><Input id="variation_set_name" name="variation_set_name" value={formData.variation_set_name || ''} onChange={handleInputChange} className="col-span-3 bg-gray-800" required /></div>
            <div className="grid grid-cols-4 items-center gap-3"><Label htmlFor="variation_type" className="text-right">Type</Label><Input id="variation_type" name="variation_type" value={formData.variation_type || ''} onChange={handleInputChange} className="col-span-3 bg-gray-800" required /></div>
            <div className="grid grid-cols-4 items-center gap-3"><Label htmlFor="value" className="text-right">Value</Label><Textarea id="value" name="value" value={formData.value || ''} onChange={handleInputChange} className="col-span-3 bg-gray-800 min-h-[60px]" required /></div>
            <div className="grid grid-cols-4 items-center gap-3"><Label htmlFor="description" className="text-right">Description</Label><Input id="description" name="description" value={formData.description || ''} onChange={handleInputChange} className="col-span-3 bg-gray-800" /></div>
            <div className="grid grid-cols-4 items-center gap-3"><Label htmlFor="theme_tags" className="text-right">Theme Tags</Label><Input id="theme_tags" name="theme_tags" value={formData.theme_tags?.join(', ') || ''} onChange={(e) => handleThemeTagsChange(e.target.value)} className="col-span-3 bg-gray-800" placeholder="comma-separated" /></div>
            <div className="grid grid-cols-4 items-center gap-3"><Label htmlFor="weight" className="text-right">Weight</Label><Input id="weight" name="weight" type="number" value={formData.weight === null ? '' : formData.weight || '1'} onChange={handleInputChange} className="col-span-3 bg-gray-800" /></div>
            <div className="grid grid-cols-4 items-center gap-3"><Label htmlFor="mutually_exclusive_group" className="text-right">Exclusive Group</Label><Input id="mutually_exclusive_group" name="mutually_exclusive_group" value={formData.mutually_exclusive_group || ''} onChange={handleInputChange} className="col-span-3 bg-gray-800" /></div>
            <div className="grid grid-cols-4 items-center gap-3"><Label htmlFor="applies_to_component_type" className="text-right">Applies To Type</Label><Input id="applies_to_component_type" name="applies_to_component_type" value={formData.applies_to_component_type || ''} onChange={handleInputChange} className="col-span-3 bg-gray-800" /></div>
            <div className="grid grid-cols-4 items-center gap-3"><Label htmlFor="is_active_sv" className="text-right">Active</Label><div className="col-span-3"><Switch id="is_active_sv" name="is_active" checked={formData.is_active === undefined ? true : formData.is_active} onCheckedChange={(cs) => setFormData(p => ({...p, is_active:Boolean(cs)}))} /></div></div>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline" disabled={isSubmitting}>Cancel</Button></DialogClose>
              <Button type="submit" disabled={isSubmitting} className="bg-cyan-600 hover:bg-cyan-700">{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} {editingVariation ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="rounded-md border border-gray-700 bg-gray-900/30">
        <Table>
          <TableHeader>{table.getHeaderGroups().map(hg => (<TableRow key={hg.id} className="border-gray-700 hover:bg-gray-800/40">{hg.headers.map(h => <TableHead key={h.id} className="text-gray-300 font-semibold py-2.5">{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableHead>)}</TableRow>))}</TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? table.getRowModel().rows.map(row => (
              <TableRow key={row.id} data-state={row.getIsSelected() && "selected"} className="border-gray-800 hover:bg-gray-800/60">
                {row.getVisibleCells().map(cell => <TableCell key={cell.id} className="py-1.5 px-3 text-gray-200 text-xs">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
              </TableRow>
            )) : (<TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-gray-400">No variations found.</TableCell></TableRow>)}
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