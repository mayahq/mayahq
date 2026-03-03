"use client";

import React, { useEffect, useState, useRef } from "react";
import { useAuth } from '@/contexts/AuthContext';
import Masonry from "react-masonry-css";
import { useMediaQuery } from 'react-responsive';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import 'swiper/css/bundle';
import { Navigation, Pagination } from 'swiper/modules';

// Type for maya_prompts table row (minimal, only what we need)
type MayaPrompt = {
  id: string;
  prompt: string;
  theme: string | null;
  message: string | null;
  negative_prompt: string | null;
  guidance_scale: number | null;
  num_inference_steps: number | null;
  lora_scale: number | null;
  model: string | null;
  aspect_ratio: string | null;
  tags: string[] | null;
  status: string | null;
  priority: number | null;
  source: string | null;
  created_at: string | null;
  updated_at: string | null;
  used_at: string | null;
  image_url: string | null;
};

type ImageDimensions = { width: number; height: number };

export default function GalleryPage() {
  const { supabase } = useAuth();
  const [images, setImages] = useState<MayaPrompt[]>([]);
  const [mounted, setMounted] = useState(false);
  const [dimensions, setDimensions] = useState<Record<string | number, ImageDimensions>>({});
  const galleryRef = useRef<HTMLDivElement>(null);
  const [modalImage, setModalImage] = useState<MayaPrompt | null>(null);
  const isMobile = useMediaQuery({ maxWidth: 767 });
  const [actionLoading, setActionLoading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Hydration fix: only render after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !supabase) return;
    // Fetch all fields for overlay
    supabase
      .from("maya_prompts")
      .select(
        [
          "id",
          "prompt",
          "theme",
          "message",
          "negative_prompt",
          "guidance_scale",
          "num_inference_steps",
          "lora_scale",
          "model",
          "aspect_ratio",
          "tags",
          "status",
          "priority",
          "source",
          "created_at",
          "updated_at",
          "used_at",
          "image_url"
        ].join(", ")
      )
      .not("image_url", "is", null)
      .order("created_at", { ascending: false })
      .then(({ data, error }: any) => {
        if (!error && data) setImages(data as MayaPrompt[]);
      });
  }, [mounted, supabase]);

  // Handle image load to get natural dimensions
  const handleImageLoad = (id: string | number, e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setDimensions((prev) =>
      prev[id]
        ? prev
        : { ...prev, [id]: { width: naturalWidth, height: naturalHeight } }
    );
  };

  // Modal close handler
  useEffect(() => {
    if (!modalImage) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalImage(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [modalImage]);

  // Lightbox close handler
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxOpen]);

  // Delete handler
  const handleDelete = async (id: string) => {
    if (!supabase) { /* toast or log error */ return; }
    setActionLoading(true);
    const { error } = await supabase.from("maya_prompts").delete().eq("id", id);
    if (!error) {
      setImages(prev => prev.filter(img => img.id !== id));
      setModalImage(null);
    }
    setActionLoading(false);
  };

  // Set priority handler
  const handleSetPriority = async (id: string) => {
    if (!supabase) { /* toast or log error */ return; }
    setActionLoading(true);
    const { error } = await supabase.from("maya_prompts").update({ priority: 1 }).eq("id", id);
    if (!error) {
      setImages(prev => prev.map(img => img.id === id ? { ...img, priority: 1 } : img));
      setModalImage(null);
    }
    setActionLoading(false);
  };

  if (!mounted) {
    // Optionally, show a skeleton or spinner here
    return null;
  }

  return (
    <main className="min-h-screen bg-white dark:bg-black px-2 md:px-8 xl:px-24 py-8">
      <h1 className="text-3xl md:text-5xl font-bold text-center mb-8 text-gray-900 dark:text-white tracking-tight">
        Maya Gallery
      </h1>
      <div id="maya-gallery" ref={galleryRef}>
        <div
          className="grid gap-6"
          style={{
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          }}
        >
          {images.map((img) => (
            <div
              key={img.id}
              className="relative group rounded-2xl overflow-hidden shadow-xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-white/80 to-gray-100/60 dark:from-gray-900/80 dark:to-gray-800/60 hover:scale-[1.025] transition-transform duration-200 cursor-pointer"
              style={{ aspectRatio: '4/3', minHeight: 180 }}
              onClick={() => setModalImage(img)}
              tabIndex={0}
            >
              <img
                src={img.image_url || undefined}
                alt={img.prompt || 'Maya prompt'}
                className="w-full h-auto object-cover rounded-2xl transition-transform duration-200 group-hover:scale-105"
                loading="lazy"
                onLoad={e => handleImageLoad(img.id, e)}
                style={{ aspectRatio: '4/3' }}
              />
            </div>
          ))}
        </div>
      </div>
      {images.length === 0 && (
        <div className="text-center text-gray-400 mt-16 text-lg">No images found.</div>
      )}
      {/* Modal dialog overlay */}
      {modalImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in-up"
          onClick={() => setModalImage(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative bg-white/90 dark:bg-gray-900/95 rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4 overflow-y-auto max-h-[90vh] border border-gray-200 dark:border-gray-700"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="absolute top-3 right-3 w-10 h-10 flex items-center justify-center rounded-full bg-black/30 hover:bg-red-600/80 text-white text-2xl font-bold shadow-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-red-400 z-10"
              style={{ lineHeight: 1 }}
              onClick={() => setModalImage(null)}
              aria-label="Close"
            >
              ×
            </button>
            <div className="mb-4">
              <img
                src={modalImage.image_url || undefined}
                alt={modalImage.prompt || 'Maya prompt'}
                className="w-full h-auto rounded-xl object-contain cursor-zoom-in"
                style={{ width: '100%', height: 'auto', maxHeight: 'calc(50vh + 120px)', display: 'block', margin: '0 auto' }}
                onClick={() => setLightboxOpen(true)}
              />
            </div>
            <div className="mb-2">
              <div className="font-bold text-xl mb-1 truncate text-gray-900 dark:text-white">{modalImage.prompt}</div>
              <div className="text-gray-700 dark:text-gray-200 whitespace-pre-line mb-4 break-words">
                {modalImage.message}
              </div>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 my-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><span className="font-semibold">Theme:</span> {modalImage.theme}</div>
              <div><span className="font-semibold">Guidance:</span> {modalImage.guidance_scale}</div>
              <div><span className="font-semibold">Steps:</span> {modalImage.num_inference_steps}</div>
              <div><span className="font-semibold">LoRA:</span> {modalImage.lora_scale}</div>
              <div><span className="font-semibold">Model:</span> {modalImage.model}</div>
              <div><span className="font-semibold">Aspect:</span> {modalImage.aspect_ratio}</div>
              <div><span className="font-semibold">Status:</span> {modalImage.status}</div>
              <div><span className="font-semibold">Priority:</span> {modalImage.priority}</div>
              <div><span className="font-semibold">Source:</span> {modalImage.source}</div>
              <div><span className="font-semibold">Created:</span> {modalImage.created_at && new Date(modalImage.created_at).toLocaleString()}</div>
              <div><span className="font-semibold">Updated:</span> {modalImage.updated_at && new Date(modalImage.updated_at).toLocaleString()}</div>
              <div><span className="font-semibold">Used:</span> {modalImage.used_at && new Date(modalImage.used_at).toLocaleString()}</div>
            </div>
            <div className="flex justify-end mt-6 gap-2">
              <button
                className="inline-block px-4 py-2 rounded bg-red-600 text-white font-semibold shadow hover:bg-red-700 transition-colors text-sm disabled:opacity-60"
                onClick={() => handleDelete(modalImage.id)}
                disabled={actionLoading}
              >
                {actionLoading ? 'Deleting...' : 'Delete'}
              </button>
              <button
                className="inline-flex items-center justify-center px-3 py-2 rounded shadow transition-colors text-sm disabled:opacity-60"
                onClick={() => handleSetPriority(modalImage.id)}
                disabled={actionLoading}
                aria-label={modalImage.priority === 1 ? 'Priority 1' : 'Set Priority 1'}
                title={modalImage.priority === 1 ? 'Priority 1' : 'Set Priority 1'}
                style={{ background: 'transparent' }}
              >
                {modalImage.priority === 1 ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="#FFD700" viewBox="0 0 24 24" strokeWidth={1.5} stroke="#FFD700" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 17.25l-6.16 3.73 1.64-7.03L2 9.75l7.19-.61L12 2.75l2.81 6.39 7.19.61-5.48 4.2 1.64 7.03z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="#aaa" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 17.25l-6.16 3.73 1.64-7.03L2 9.75l7.19-.61L12 2.75l2.81 6.39 7.19.61-5.48 4.2 1.64 7.03z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {lightboxOpen && modalImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 animate-fade-in-up cursor-zoom-out"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <img
            src={modalImage.image_url || undefined}
            alt={modalImage.prompt || 'Maya prompt'}
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            style={{ width: 'auto', height: 'auto' }}
          />
        </div>
      )}
    </main>
  );
} 