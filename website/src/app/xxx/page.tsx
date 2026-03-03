"use client";

import { useEffect, useState } from "react";
import { useAuth } from '@/contexts/AuthContext';
import { Tables } from "@/lib/database.types";
import Image from "next/image";
import { Star, Trash2, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import Link from "next/link";
import { useRouter, usePathname } from 'next/navigation';

// Types
export type Generation = Tables<'generations'>;

type SeriesMap = Record<string, Generation[]>;

// Helper: get highest rated images (4+ stars)
function getHighestRatedImages(seriesMap: SeriesMap, filterSeries?: string) {
  let allImages = Object.values(seriesMap).flat();
  if (filterSeries) {
    allImages = seriesMap[filterSeries] || [];
  }
  return allImages.filter(img => (img.star_rating ?? 0) >= 4).sort((a, b) => (b.star_rating ?? 0) - (a.star_rating ?? 0));
}

// Helper: sort series so those with 4+ star images are at the top
function sortSeries(seriesMap: SeriesMap) {
  const entries = Object.entries(seriesMap);
  return entries.sort((a, b) => {
    const aMax = Math.max(...a[1].map(img => img.star_rating ?? 0));
    const bMax = Math.max(...b[1].map(img => img.star_rating ?? 0));
    if (aMax >= 4 && bMax < 4) return -1;
    if (aMax < 4 && bMax >= 4) return 1;
    return bMax - aMax;
  });
}

// Helper: strip tag type prefix (e.g., 'hair:blonde' -> 'blonde')
function cleanTag(tag: string) {
  const idx = tag.indexOf(":");
  return idx !== -1 ? tag.slice(idx + 1) : tag;
}

export default function GenerationsPage() {
  const { supabase } = useAuth();
  const [seriesMap, setSeriesMap] = useState<SeriesMap>({});
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<Generation | null>(null);
  const [lightboxImage, setLightboxImage] = useState<Generation | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(true);

  // Navigation Bar
  const nav = (
    <nav className="w-full bg-black/80 border-b border-gray-800 py-4 px-8 flex items-center sticky top-0 z-30">
      <Link
        href="/xxx"
        className="text-2xl font-bold text-purple-400 tracking-wide neon-glow hover:text-purple-300 transition-colors"
        onClick={() => {
          setSelectedSeries(null);
          setSelectedImage(null);
          setLightboxImage(null);
        }}
      >
        Maya XXX
      </Link>
    </nav>
  );

  useEffect(() => {
    if (!mounted || !supabase) return;
    const fetchGenerations = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("generations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        setLoading(false);
        return;
      }
      // Group by series
      const map: SeriesMap = {};
      (data || []).forEach((gen) => {
        const key = gen.series || "Uncategorized";
        if (!map[key]) map[key] = [];
        map[key].push(gen);
      });
      setSeriesMap(map);
      setLoading(false);
    };
    fetchGenerations();
  }, [mounted, supabase]);

  // Star rating update
  const handleStar = async (img: Generation, rating: number) => {
    if (!supabase) return;
    await supabase.from('generations').update({ star_rating: rating }).eq('id', img.id);
    setSeriesMap(prev => {
      const updated: SeriesMap = {};
      for (const [series, images] of Object.entries(prev)) {
        updated[series] = images.map(i => i.id === img.id ? { ...i, star_rating: rating } : i);
      }
      return updated;
    });
    setSelectedImage(img => img ? { ...img, star_rating: rating } : img);
  };

  // Keyboard navigation for detail page
  useEffect(() => {
    if (!selectedImage || !selectedSeries) return;
    const images = seriesMap[selectedSeries] || [];
    const idx = images.findIndex(i => i.id === selectedImage.id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && idx > 0) setSelectedImage(images[idx - 1]);
      if (e.key === 'ArrowRight' && idx < images.length - 1) setSelectedImage(images[idx + 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedImage, selectedSeries, seriesMap]);

  // Delete handler
  const handleDelete = async (id: number) => {
    if (!supabase) return;
    await supabase.from("generations").delete().eq("id", id);
    // Remove from UI
    setSeriesMap((prev) => {
      const updated: SeriesMap = {};
      for (const [series, images] of Object.entries(prev)) {
        updated[series] = images.filter((img) => img.id !== id);
      }
      return updated;
    });
    if (selectedImage?.id === id) setSelectedImage(null);
    if (lightboxImage?.id === id) setLightboxImage(null);
  };

  const handleSetPriority = async (id: string) => {
    if (!supabase) return;
    await supabase.from("generations").update({ priority: 1 }).eq("id", id);
  };

  // UI
  if (loading) return <div>{nav}<div className="p-8 text-center">Loading...</div></div>;

  if (selectedImage && !lightboxImage) {
    const images = selectedSeries ? seriesMap[selectedSeries] || [] : [];
    const idx = images.findIndex(i => i.id === selectedImage.id);
    const prevImg = idx > 0 ? images[idx - 1] : null;
    const nextImg = idx < images.length - 1 ? images[idx + 1] : null;
    return (
      <div>
        {nav}
        <div className="p-8 max-w-5xl mx-auto flex flex-col md:flex-row gap-8 items-start">
          <div className="relative w-full md:w-[480px] h-[400px] md:h-[600px] flex-shrink-0 cursor-pointer group" onClick={() => setLightboxImage(selectedImage)}>
            <Image src={selectedImage.image_url} alt="Image" fill className="object-contain rounded-lg" />
          </div>
          <div className="flex-1 space-y-4">
            <div className="mb-2">
              <button className="text-purple-400 hover:underline text-sm font-medium" onClick={() => { setSelectedImage(null); setSelectedSeries(null); }}>
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
            <div className="mb-2"><b>Prompt:</b> <p className="inline text-gray-300 font-normal">{selectedImage.prompt}</p></div>
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
              {prevImg && <button className="flex items-center gap-1 px-3 py-2 bg-gray-800 rounded hover:bg-gray-700" onClick={() => setSelectedImage(prevImg)}><ChevronLeft />Previous</button>}
              {nextImg && <button className="flex items-center gap-1 px-3 py-2 bg-gray-800 rounded hover:bg-gray-700" onClick={() => setSelectedImage(nextImg)}>Next<ChevronRight /></button>}
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

  if (lightboxImage) {
    // Lightbox
    return (
      <div>
        {nav}
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center" onClick={() => setLightboxImage(null)}>
          <Image src={lightboxImage.image_url} alt="Image" width={900} height={900} className="object-contain max-h-[90vh] rounded-lg" />
          <div className="mt-4 text-gray-300">Click anywhere to close</div>
        </div>
      </div>
    );
  }

  if (selectedSeries) {
    const images = seriesMap[selectedSeries] || [];
    const highestRated = getHighestRatedImages(seriesMap, selectedSeries).slice(0, 10);
    return (
      <div>
        {nav}
        <div className="p-8 max-w-5xl mx-auto">
          {highestRated.length > 0 && (
            <div className="mb-10">
              <h2 className="text-xl font-bold mb-2 text-yellow-400">Highest Rated in this Series</h2>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {highestRated.map(img => (
                  <div key={img.id} className="min-w-[180px] max-w-[220px] cursor-pointer" onClick={() => setSelectedImage(img)}>
                    <div className="relative w-full aspect-square">
                      <Image src={img.image_url} alt={img.prompt} fill className="object-cover rounded-lg border-2 border-yellow-400" />
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {[1,2,3,4,5].map(n => <Star key={n} size={14} className={(img.star_rating ?? 0) >= n ? 'text-yellow-400' : 'text-gray-700'} fill={(img.star_rating ?? 0) >= n ? '#facc15' : 'none'} />)}
                      <span className="text-xs text-gray-400 ml-1">{img.star_rating ?? 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button className="mb-4 text-purple-400" onClick={() => setSelectedSeries(null)}>&larr; Back to Series</button>
          <h2 className="text-2xl font-bold mb-6">Series: {selectedSeries}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {images.map((img) => (
              <div key={img.id} className="relative group border border-gray-800 rounded-lg overflow-hidden shadow-lg bg-gray-950">
                <div className="relative w-full aspect-square cursor-pointer" onClick={() => setSelectedImage(img)}>
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

  // Home page: highest rated carousel
  const highestRated = getHighestRatedImages(seriesMap).slice(0, 10);

  // Series overview
  return (
    <div>
      {nav}
      <div className="p-8 max-w-5xl mx-auto">
        {highestRated.length > 0 && (
          <div className="mb-10">
            <h2 className="text-xl font-bold mb-2 text-yellow-400">Highest Rated</h2>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {highestRated.map(img => (
                <div key={img.id} className="min-w-[180px] max-w-[220px] cursor-pointer" onClick={() => { setSelectedSeries(img.series || 'Uncategorized'); setSelectedImage(img); }}>
                  <div className="relative w-full aspect-square">
                    <Image src={img.image_url} alt={img.prompt} fill className="object-cover rounded-lg border-2 border-yellow-400" />
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    {[1,2,3,4,5].map(n => <Star key={n} size={14} className={(img.star_rating ?? 0) >= n ? 'text-yellow-400' : 'text-gray-700'} fill={(img.star_rating ?? 0) >= n ? '#facc15' : 'none'} />)}
                    <span className="text-xs text-gray-400 ml-1">{img.star_rating ?? 0}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <h1 className="text-3xl font-bold mb-8">Image Series</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {sortSeries(seriesMap).map(([series, images]) => (
            <div key={series} className="border border-gray-800 rounded-lg overflow-hidden shadow-lg bg-gray-950 cursor-pointer hover:shadow-purple-900/30 transition-shadow" onClick={() => setSelectedSeries(series)}>
              <div className="relative w-full aspect-square">
                <Image src={images[0].image_url} alt={series} fill className="object-cover" />
              </div>
              <div className="p-4">
                <div className="font-semibold text-lg text-purple-300 truncate">{series}</div>
                <div className="text-gray-400 text-sm">{images.length} image{images.length !== 1 ? "s" : ""}</div>
                <div className="flex items-center gap-1 mt-1">
                  {[1,2,3,4,5].map(n => <Star key={n} size={14} className={Math.max(...images.map(i => i.star_rating ?? 0)) >= n ? 'text-yellow-400' : 'text-gray-700'} fill={Math.max(...images.map(i => i.star_rating ?? 0)) >= n ? '#facc15' : 'none'} />)}
                  <span className="text-xs text-gray-400 ml-1">{Math.max(...images.map(i => i.star_rating ?? 0))}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 