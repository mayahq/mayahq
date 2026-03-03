import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Trash2, Star } from 'lucide-react';
import type { Tables } from '@/lib/database.types';
type Generation = Tables<'generations'>;

export default function TagPage({ tag, images, handleDelete }: { tag: string, images: Generation[], handleDelete: (id: number) => void }) {
  const highestRated = images.filter(img => (img.star_rating ?? 0) >= 4).sort((a, b) => (b.star_rating ?? 0) - (a.star_rating ?? 0)).slice(0, 10);
  const router = useRouter();
  return (
    <div className="p-8 max-w-5xl mx-auto">
      {highestRated.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xl font-bold mb-2 text-yellow-400">Highest Rated for &quot;{tag}&quot;</h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {highestRated.map(img => (
              <div key={img.id} className="min-w-[180px] max-w-[220px] cursor-pointer" onClick={() => router.push(`/xxx/tag/${encodeURIComponent(tag)}?img=${img.id}`)}>
                <div className="relative w-full aspect-square overflow-hidden rounded-lg">
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
      <h2 className="text-2xl font-bold mb-6">Tag: {tag}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {images.map((img) => (
          <div key={img.id} className="relative group border border-gray-800 rounded-lg overflow-hidden shadow-lg bg-gray-950">
            <div className="relative w-full aspect-square cursor-pointer overflow-hidden rounded-lg" onClick={() => router.push(`/xxx/tag/${encodeURIComponent(tag)}?img=${img.id}`)}>
              <Image src={img.image_url} alt="Image" fill className="object-cover group-hover:scale-105 transition-transform duration-200 rounded-lg" />
            </div>
            <button onClick={() => handleDelete(img.id)} className="absolute top-2 right-2 bg-black/40 hover:bg-red-700/80 text-red-400 rounded-full p-2 transition-colors"><Trash2 size={18} /></button>
          </div>
        ))}
      </div>
    </div>
  );
} 