"use client";
import TagPage from '../TagPage';
import type { Tables } from '@/lib/database.types';
type Generation = Tables<'generations'>;
import { useState, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Star, Trash2, ChevronLeft, ChevronRight, ChevronDown, Download } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

function cleanTag(tag: string) {
  const idx = tag.indexOf(":");
  return idx !== -1 ? tag.slice(idx + 1) : tag;
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export default function ClientTagPage({ tag, images: initialImages }: { tag: string, images: Generation[] }) {
  const { supabase } = useAuth();
  const [images, setImages] = useState(initialImages);
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const imgId = searchParams ? searchParams.get('img') : null;
  const selectedImage = useMemo(() => images.find(img => String(img.id) === imgId), [images, imgId]);
  const idx = selectedImage ? images.findIndex(img => String(img.id) === imgId) : -1;
  const prevImg = idx > 0 ? images[idx - 1] : null;
  const nextImg = idx !== -1 && idx < images.length - 1 ? images[idx + 1] : null;

  // Get unique series and tags from images
  const allSeries = useMemo(() => unique(images.map(img => img.series || 'Uncategorized')), [images]);
  const allTags = useMemo(() => unique(images.flatMap(img => (img.tags || []).map(cleanTag))), [images]);

  const [seriesView, setSeriesView] = useState<string | null>(null);

  const handleDelete = async (id: number) => {
    if (!supabase) return;
    await supabase.from('generations').delete().eq('id', id);
    setImages(prev => prev.filter(img => img.id !== id));
    if (selectedImage?.id === id) handleClose();
  };

  const handleClose = () => {
    if (!searchParams) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('img');
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleStar = async (img: Generation, rating: number) => {
    if (!supabase) return;
    await supabase.from('generations').update({ star_rating: rating }).eq('id', img.id);
    setImages(prev => prev.map(i => i.id === img.id ? { ...i, star_rating: rating } : i));
  };

  const goToImg = (img: Generation) => {
    router.replace(`?img=${img.id}`, { scroll: false });
  };

  // Close dropdowns on click outside
  const navRef = useRef<HTMLDivElement>(null);
  // Simple click outside handler
  if (typeof window !== 'undefined') {
    window.onclick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setSeriesOpen(false);
        setTagsOpen(false);
      }
    };
  }

  if (imgId && selectedImage && !seriesView) {
    // Filter images by the selected image's series
    const seriesImages = images.filter(img => (img.series || 'Uncategorized') === (selectedImage.series || 'Uncategorized'));
    return (
      <div>
        {/* Navigation Bar */}
        <nav className="w-full bg-black/80 border-b border-gray-800 py-4 px-8 flex items-center sticky top-0 z-30">
          <Link href="/xxx" className="text-2xl font-bold text-purple-400 tracking-wide neon-glow hover:text-purple-300 transition-colors">Maya XXX</Link>
        </nav>
        <div className="p-8 max-w-5xl mx-auto flex flex-col md:flex-row gap-8 items-start">
          <div className="relative w-full md:w-[480px] h-[400px] md:h-[600px] flex-shrink-0 cursor-pointer group">
            <Image src={selectedImage.image_url} alt="Image" fill className="object-contain rounded-lg" />
          </div>
          <div className="flex-1 space-y-4">
            <div className="mb-2">
              <button className="text-purple-400 hover:underline text-sm font-medium" onClick={() => { setSeriesView(selectedImage.series || 'Uncategorized'); router.replace(`?`, { scroll: false }); }}>
                &larr; Back to Series
              </button>
            </div>
            <h2 className="text-xl font-bold text-purple-200 mb-2">{selectedImage.series || "Uncategorized"}</h2>
            <div className="flex flex-wrap gap-2 mb-2">
              {(selectedImage.tags || []).map(tag => (
                <Link key={tag} href={`/xxx/tag/${encodeURIComponent(cleanTag(tag))}`}
                  className="inline-block px-3 py-1 rounded-full bg-purple-900/60 text-purple-200 text-xs font-semibold hover:bg-purple-700/80 transition-colors border border-purple-700">
                  {cleanTag(tag)}
                </Link>
              ))}
            </div>
            <div className="mb-2"><b>Prompt:</b> <span className="inline text-gray-300 font-normal">{selectedImage.prompt}</span></div>
            <div className="mb-2 flex items-center gap-1">
              <span className="font-semibold text-gray-400">Rating:</span>
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => handleStar(selectedImage, n)} aria-label={`Rate ${n} star`} className="focus:outline-none">
                  <Star size={22} className={"transition-colors " + ((selectedImage.star_rating ?? 0) >= n ? 'text-yellow-400' : 'text-gray-700')} fill={(selectedImage.star_rating ?? 0) >= n ? '#facc15' : 'none'} />
                </button>
              ))}
              <span className="ml-2 text-gray-400 text-base font-medium">{selectedImage.star_rating ?? 0}/5</span>
            </div>
            <div><b>Date:</b> <span className="text-gray-300">{new Date(selectedImage.created_at).toLocaleString()}</span></div>
            <div><b>Metadata:</b> <pre className="bg-gray-900 rounded p-2 text-xs text-gray-400 overflow-x-auto">{JSON.stringify(selectedImage.metadata, null, 2)}</pre></div>
            <div className="flex gap-4 mt-6 items-center">
              {prevImg && <button className="flex items-center gap-1 px-3 py-2 bg-gray-800 rounded hover:bg-gray-700" onClick={() => router.replace(`?img=${prevImg.id}`, { scroll: false })}><ChevronLeft />Previous</button>}
              {nextImg && <button className="flex items-center gap-1 px-3 py-2 bg-gray-800 rounded hover:bg-gray-700" onClick={() => router.replace(`?img=${nextImg.id}`, { scroll: false })}>Next<ChevronRight /></button>}
              <a href={selectedImage.image_url} download target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-2 bg-black/60 hover:bg-blue-700/80 text-blue-400 rounded transition-colors">
                <Download size={20} />Download
              </a>
              <button onClick={() => handleDelete(selectedImage.id)} className="flex items-center gap-1 px-3 py-2 bg-black/60 hover:bg-red-700/80 text-red-400 rounded transition-colors"><Trash2 size={20} />Delete</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Series view for tag
  if (seriesView) {
    const seriesImages = images.filter(img => (img.series || 'Uncategorized') === seriesView);
    return (
      <div>
        {/* Navigation Bar */}
        <nav className="w-full bg-black/80 border-b border-gray-800 py-4 px-8 flex items-center sticky top-0 z-30">
          <Link href="/xxx" className="text-2xl font-bold text-purple-400 tracking-wide neon-glow hover:text-purple-300 transition-colors">Maya XXX</Link>
        </nav>
        <div className="p-8 max-w-5xl mx-auto">
          <button className="mb-4 text-purple-400" onClick={() => setSeriesView(null)}>&larr; Back to Tag Results</button>
          <h2 className="text-2xl font-bold mb-6">Series: {seriesView}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {seriesImages.map((img) => (
              <div key={img.id} className="relative group border border-gray-800 rounded-lg overflow-hidden shadow-lg bg-gray-950">
                <div className="relative w-full aspect-square cursor-pointer" onClick={() => { setSeriesView(null); router.replace(`?img=${img.id}`, { scroll: false }); }}>
                  <Image src={img.image_url} alt="Image" fill className="object-cover group-hover:scale-105 transition-transform duration-200" />
                </div>
                <button onClick={() => handleDelete(img.id)} className="absolute top-2 right-2 bg-black/40 hover:bg-red-700/80 text-red-400 rounded-full p-2 transition-colors"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Navigation Bar */}
      <nav className="w-full bg-black/80 border-b border-gray-800 py-4 px-8 flex items-center sticky top-0 z-30">
        <Link href="/xxx" className="text-2xl font-bold text-purple-400 tracking-wide neon-glow hover:text-purple-300 transition-colors">Maya XXX</Link>
      </nav>
      <TagPage tag={tag} images={images} handleDelete={handleDelete} />
    </>
  );
} 