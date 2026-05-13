'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useTripStore } from '@/store/tripStore';
import { CategoryBadge } from '@/components/ui/CategoryBadge';
import { PhotoUpload } from '@/components/ui/PhotoUpload';
import { createClient } from '@/lib/supabase/client';
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type PinCategory,
  type PinPhoto,
} from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';

type Tab = 'info' | 'photos' | 'budget';

interface StarRatingProps {
  value?: number;
  onChange?: (val: number) => void;
  readonly?: boolean;
}

function StarRating({ value = 0, onChange, readonly }: StarRatingProps) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          disabled={readonly}
          onClick={() => onChange?.(star)}
          className={`text-xl transition-transform ${
            readonly ? 'cursor-default' : 'hover:scale-110 cursor-pointer'
          } ${star <= value ? 'text-amber-400' : 'text-slate-600'}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function PinDetailPanel() {
  const { selectedPin, setSelectedPin, updatePin, removePin } = useTripStore();
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<PinPhoto[]>(selectedPin?.photos ?? []);
  const [editData, setEditData] = useState({
    title: '',
    description: '',
    address: '',
    category: '' as PinCategory,
    rating: 0,
    estimated_cost: '',
    day_number: '',
    stay_duration_hours: '',
    visit_date: '',
  });

  const supabase = createClient();

  const startEdit = useCallback(() => {
    if (!selectedPin) return;
    setEditData({
      title: selectedPin.title,
      description: selectedPin.description ?? '',
      address: selectedPin.address ?? '',
      category: selectedPin.category,
      rating: selectedPin.rating ?? 0,
      estimated_cost: selectedPin.estimated_cost?.toString() ?? '',
      day_number: selectedPin.day_number?.toString() ?? '',
      stay_duration_hours: selectedPin.stay_duration_hours?.toString() ?? '',
      visit_date: selectedPin.visit_date ?? '',
    });
    setIsEditing(true);
  }, [selectedPin]);

  const saveEdit = useCallback(async () => {
    if (!selectedPin) return;
    setSaving(true);

    const updates = {
      title: editData.title,
      description: editData.description || null,
      address: editData.address || null,
      category: editData.category,
      rating: editData.rating || null,
      estimated_cost: editData.estimated_cost ? parseFloat(editData.estimated_cost) : null,
      day_number: editData.day_number ? parseInt(editData.day_number) : null,
      stay_duration_hours: editData.stay_duration_hours ? parseFloat(editData.stay_duration_hours) : null,
      visit_date: editData.visit_date || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('pins')
      .update(updates)
      .eq('id', selectedPin.id)
      .select()
      .single();

    if (!error && data) {
      updatePin({ ...selectedPin, ...data });
    }
    setSaving(false);
    setIsEditing(false);
  }, [selectedPin, editData, supabase, updatePin]);

  const toggleFavorite = useCallback(async () => {
    if (!selectedPin) return;
    const { data, error } = await supabase
      .from('pins')
      .update({ is_favorite: !selectedPin.is_favorite })
      .eq('id', selectedPin.id)
      .select()
      .single();
    if (!error && data) updatePin({ ...selectedPin, ...data });
  }, [selectedPin, supabase, updatePin]);

  const toggleCompleted = useCallback(async () => {
    if (!selectedPin) return;
    const { data, error } = await supabase
      .from('pins')
      .update({ is_completed: !selectedPin.is_completed })
      .eq('id', selectedPin.id)
      .select()
      .single();
    if (!error && data) updatePin({ ...selectedPin, ...data });
  }, [selectedPin, supabase, updatePin]);

  const handleDelete = useCallback(async () => {
    if (!selectedPin) return;
    if (!confirm(`Delete "${selectedPin.title}"?`)) return;
    await supabase.from('pins').delete().eq('id', selectedPin.id);
    removePin(selectedPin.id);
    setSelectedPin(null);
  }, [selectedPin, supabase, removePin, setSelectedPin]);

  const handlePhotoUploaded = useCallback(
    async (url: string, storagePath: string) => {
      if (!selectedPin) return;
      const { data, error } = await supabase
        .from('pin_photos')
        .insert({ pin_id: selectedPin.id, url, storage_path: storagePath })
        .select()
        .single();
      if (!error && data) {
        setPhotos((prev) => [...prev, data as PinPhoto]);
      }
    },
    [selectedPin, supabase]
  );

  const color = selectedPin ? CATEGORY_COLORS[selectedPin.category] : '#F59E0B';

  return (
    <AnimatePresence>
      {selectedPin && (
        <>
          {/* Backdrop on mobile */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-20 lg:hidden"
            onClick={() => setSelectedPin(null)}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 bottom-0 z-30 w-full max-w-sm bg-[#13131A] border-l border-white/8 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div
              className="p-4 border-b border-white/8"
              style={{ borderTopColor: color, borderTopWidth: 3 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <input
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white font-semibold text-lg outline-none focus:border-amber-500/50"
                      value={editData.title}
                      onChange={(e) => setEditData((d) => ({ ...d, title: e.target.value }))}
                    />
                  ) : (
                    <h2 className="text-white font-semibold text-lg truncate">{selectedPin.title}</h2>
                  )}
                  <div className="mt-1.5">
                    {isEditing ? (
                      <select
                        value={editData.category}
                        onChange={(e) => setEditData((d) => ({ ...d, category: e.target.value as PinCategory }))}
                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-sm outline-none focus:border-amber-500/50"
                      >
                        {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    ) : (
                      <CategoryBadge category={selectedPin.category} size="sm" />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={toggleFavorite}
                    title="Favorite"
                    className={`p-2 rounded-lg transition-colors ${selectedPin.is_favorite ? 'text-amber-400 bg-amber-400/10' : 'text-slate-500 hover:text-amber-400 hover:bg-amber-400/10'}`}
                  >
                    ★
                  </button>
                  <button
                    onClick={toggleCompleted}
                    title="Mark complete"
                    className={`p-2 rounded-lg transition-colors ${selectedPin.is_completed ? 'text-emerald-400 bg-emerald-400/10' : 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-400/10'}`}
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => setSelectedPin(null)}
                    className="p-2 text-slate-500 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/8">
              {(['info', 'photos', 'budget'] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2.5 text-sm font-medium capitalize transition-colors ${
                    activeTab === tab
                      ? 'text-amber-400 border-b-2 border-amber-400'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeTab === 'info' && (
                <>
                  {/* Address */}
                  <div>
                    <label className="text-xs text-slate-500 uppercase tracking-wider">Address</label>
                    {isEditing ? (
                      <input
                        className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500/50"
                        value={editData.address}
                        placeholder="Enter address..."
                        onChange={(e) => setEditData((d) => ({ ...d, address: e.target.value }))}
                      />
                    ) : (
                      <p className="text-white text-sm mt-1">{selectedPin.address || <span className="text-slate-500">No address</span>}</p>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-xs text-slate-500 uppercase tracking-wider">Notes</label>
                    {isEditing ? (
                      <textarea
                        className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500/50 resize-none"
                        rows={3}
                        value={editData.description}
                        placeholder="Add notes..."
                        onChange={(e) => setEditData((d) => ({ ...d, description: e.target.value }))}
                      />
                    ) : (
                      <p className="text-white text-sm mt-1">{selectedPin.description || <span className="text-slate-500">No notes</span>}</p>
                    )}
                  </div>

                  {/* Rating */}
                  <div>
                    <label className="text-xs text-slate-500 uppercase tracking-wider">Rating</label>
                    <div className="mt-1">
                      {isEditing ? (
                        <StarRating value={editData.rating} onChange={(v) => setEditData((d) => ({ ...d, rating: v }))} />
                      ) : (
                        <StarRating value={selectedPin.rating ?? 0} readonly />
                      )}
                    </div>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 uppercase tracking-wider">Day #</label>
                      {isEditing ? (
                        <input
                          type="number"
                          className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-amber-500/50"
                          value={editData.day_number}
                          placeholder="e.g. 3"
                          onChange={(e) => setEditData((d) => ({ ...d, day_number: e.target.value }))}
                        />
                      ) : (
                        <p className="text-white text-sm mt-1">
                          {selectedPin.day_number ? `Day ${selectedPin.day_number}` : <span className="text-slate-500">—</span>}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 uppercase tracking-wider">Est. Cost</label>
                      {isEditing ? (
                        <input
                          type="number"
                          className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-amber-500/50"
                          value={editData.estimated_cost}
                          placeholder="$0"
                          onChange={(e) => setEditData((d) => ({ ...d, estimated_cost: e.target.value }))}
                        />
                      ) : (
                        <p className="text-white text-sm mt-1">
                          {selectedPin.estimated_cost ? formatCurrency(selectedPin.estimated_cost) : <span className="text-slate-500">—</span>}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 uppercase tracking-wider">Visit Date</label>
                      {isEditing ? (
                        <input
                          type="date"
                          className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-amber-500/50"
                          value={editData.visit_date}
                          onChange={(e) => setEditData((d) => ({ ...d, visit_date: e.target.value }))}
                        />
                      ) : (
                        <p className="text-white text-sm mt-1">
                          {selectedPin.visit_date ? formatDate(selectedPin.visit_date) : <span className="text-slate-500">—</span>}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 uppercase tracking-wider">Duration (hrs)</label>
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.5"
                          className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-amber-500/50"
                          value={editData.stay_duration_hours}
                          placeholder="e.g. 2"
                          onChange={(e) => setEditData((d) => ({ ...d, stay_duration_hours: e.target.value }))}
                        />
                      ) : (
                        <p className="text-white text-sm mt-1">
                          {selectedPin.stay_duration_hours ? `${selectedPin.stay_duration_hours}h` : <span className="text-slate-500">—</span>}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Coords */}
                  <div className="text-xs text-slate-600 font-mono">
                    {selectedPin.lat.toFixed(5)}, {selectedPin.lng.toFixed(5)}
                  </div>
                </>
              )}

              {activeTab === 'photos' && (
                <div className="space-y-3">
                  <PhotoUpload
                    tripId={selectedPin.trip_id}
                    pinId={selectedPin.id}
                    onUploaded={handlePhotoUploaded}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {photos.map((photo) => (
                      <div key={photo.id} className="aspect-square relative rounded-lg overflow-hidden bg-white/5">
                        <Image
                          src={photo.url}
                          alt={photo.caption ?? 'Pin photo'}
                          fill
                          className="object-cover"
                        />
                      </div>
                    ))}
                  </div>
                  {photos.length === 0 && (
                    <p className="text-center text-slate-500 text-sm py-4">No photos yet</p>
                  )}
                </div>
              )}

              {activeTab === 'budget' && (
                <div className="space-y-3">
                  <p className="text-slate-400 text-sm">
                    Budget items linked to this pin appear here.
                  </p>
                  {selectedPin.estimated_cost && (
                    <div className="bg-white/5 border border-white/8 rounded-xl p-3 flex justify-between items-center">
                      <span className="text-slate-300 text-sm">Estimated Cost</span>
                      <span className="text-amber-400 font-semibold">
                        {formatCurrency(selectedPin.estimated_cost)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="p-4 border-t border-white/8 flex gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold py-2 rounded-xl transition-colors disabled:opacity-70 text-sm"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 bg-white/5 hover:bg-white/10 text-white py-2 rounded-xl transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={startEdit}
                    className="flex-1 bg-white/5 hover:bg-white/10 text-white py-2 rounded-xl transition-colors text-sm border border-white/10"
                  >
                    Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    className="px-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 py-2 rounded-xl transition-colors text-sm border border-red-500/20"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
