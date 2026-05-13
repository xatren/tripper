'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Camera, Upload, X, Trash2, MapPin, ImageIcon } from 'lucide-react'
import type { Photo, Stop } from '@/types'

interface PhotoGalleryProps {
  photos: Photo[]
  stops: Stop[]
  tripId: string
  currentUserId: string
  onAddPhoto: (photo: Photo) => void
  onDeletePhoto: (photoId: string) => void
}

export function PhotoGallery({ photos, stops, currentUserId, onAddPhoto, onDeletePhoto }: PhotoGalleryProps) {
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [selectedStopId, setSelectedStopId] = useState<string>('')
  const [caption, setCaption] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const handleUpload = async () => {
    if (!selectedFile || !selectedStopId) return
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      const response = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!response.ok) throw new Error('Upload failed')
      const { pathname } = await response.json()
      const supabase = createClient()
      const { data, error } = await supabase
        .from('photos')
        .insert({ stop_id: selectedStopId, blob_pathname: pathname, caption: caption || null, uploaded_by: currentUserId })
        .select()
        .single()
      if (error) throw error
      onAddPhoto(data as Photo)
      setIsUploadOpen(false)
      resetForm()
    } catch (err) {
      console.error('Upload error:', err)
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (photo: Photo) => {
    try {
      await fetch('/api/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathname: photo.blob_pathname }),
      })
      onDeletePhoto(photo.id)
      setSelectedPhoto(null)
    } catch (err) {
      console.error('Delete error:', err)
    }
  }

  const resetForm = () => {
    setSelectedFile(null)
    setPreviewUrl(null)
    setCaption('')
    setSelectedStopId('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const photosByStop = stops
    .map((stop) => ({ stop, photos: photos.filter((p) => p.stop_id === stop.id) }))
    .filter((g) => g.photos.length > 0)

  if (stops.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <MapPin className="mb-4 h-10 w-10 text-muted-foreground/50" />
        <h3 className="mb-1 font-medium text-foreground">Add stops first</h3>
        <p className="text-sm text-muted-foreground">Photos are organized by stop.</p>
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">
          {photos.length} Photo{photos.length !== 1 ? 's' : ''}
        </h2>
        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Photo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Stop</Label>
                <Select value={selectedStopId} onValueChange={setSelectedStopId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a stop" />
                  </SelectTrigger>
                  <SelectContent>
                    {stops.map((stop) => (
                      <SelectItem key={stop.id} value={stop.id}>
                        {stop.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Photo</Label>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                {previewUrl ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="Preview" className="h-48 w-full rounded-lg object-cover" />
                    <Button size="icon" variant="destructive" className="absolute right-2 top-2 h-8 w-8" onClick={resetForm}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-48 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-primary"
                  >
                    <Camera className="mb-2 h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Click to select photo</span>
                  </button>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="caption">Caption (optional)</Label>
                <Input id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a caption..." />
              </div>
              <Button className="w-full" onClick={handleUpload} disabled={!selectedFile || !selectedStopId || isUploading}>
                {isUploading ? 'Uploading...' : 'Upload Photo'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ImageIcon className="mb-4 h-10 w-10 text-muted-foreground/50" />
          <h3 className="mb-1 font-medium text-foreground">No photos yet</h3>
          <p className="text-sm text-muted-foreground">Upload photos for your stops</p>
        </div>
      ) : (
        <div className="space-y-6">
          {photosByStop.map(({ stop, photos: stopPhotos }) => (
            <div key={stop.id}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <MapPin className="h-4 w-4 text-primary" />
                {stop.name}
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {stopPhotos.map((photo) => (
                  <button
                    key={photo.id}
                    onClick={() => setSelectedPhoto(photo)}
                    className="group relative aspect-square overflow-hidden rounded-lg"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/file?pathname=${encodeURIComponent(photo.blob_pathname)}`}
                      alt={photo.caption || 'Trip photo'}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
        <DialogContent className="max-w-3xl">
          {selectedPhoto && (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/file?pathname=${encodeURIComponent(selectedPhoto.blob_pathname)}`}
                alt={selectedPhoto.caption || 'Trip photo'}
                className="mb-4 max-h-[70vh] w-full rounded-lg object-contain"
              />
              {selectedPhoto.caption && (
                <p className="mb-4 text-center text-foreground">{selectedPhoto.caption}</p>
              )}
              <div className="flex justify-center">
                <Button variant="destructive" size="sm" onClick={() => handleDelete(selectedPhoto)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Photo
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
