'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { X, Minimize, Pin } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface Note {
    id: number;
    title: string;
    content: string;
    color: string;
    is_pinned: boolean;
    position_x: number | null;
    position_y: number | null;
    width: number | null;
    height: number | null;
}

// Debounce function
function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

export default function StickyNotePage() {
    const params = useParams();
    const noteId = params.id as string;

    const [note, setNote] = useState<Note | null>(null);
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [alwaysOnTop, setAlwaysOnTop] = useState(true);

    // Electron API
    const getElectronAPI = () => {
        if (typeof window !== 'undefined' && (window as any).electronAPI) {
            return (window as any).electronAPI;
        }
        return null;
    };

    // Load note data
    useEffect(() => {
        loadNote();
    }, [noteId]);

    // Auto-save content (debounced)
    const debouncedSave = useCallback(
        debounce(async (newContent: string) => {
            if (!noteId) return;

            setSaving(true);
            try {
                await apiClient.updateNote(parseInt(noteId), {
                    content: newContent
                });
                setLastSaved(new Date());
            } catch (error) {
                console.error('Failed to save note:', error);
            } finally {
                setSaving(false);
            }
        }, 2000),
        [noteId]
    );

    // Save on content change
    useEffect(() => {
        if (note && content !== note.content) {
            debouncedSave(content);
        }
    }, [content, note, debouncedSave]);

    // Listen for window bounds changes
    useEffect(() => {
        const electronAPI = getElectronAPI();
        if (!electronAPI) return;

        electronAPI.onWindowBoundsChanged?.(async (bounds: any) => {
            try {
                await apiClient.updateNote(parseInt(noteId), {
                    position_x: bounds.x,
                    position_y: bounds.y,
                    width: bounds.width,
                    height: bounds.height
                });
            } catch (error) {
                console.error('Failed to save window bounds:', error);
            }
        });

        electronAPI.onAlwaysOnTopChanged?.((isOnTop: boolean) => {
            setAlwaysOnTop(isOnTop);
        });
    }, [noteId]);

    const loadNote = async () => {
        try {
            const data = await apiClient.fetchNotes();
            const foundNote = data.notes.find((n: Note) => n.id === parseInt(noteId));
            if (foundNote) {
                setNote(foundNote);
                setContent(foundNote.content || '');
            }
        } catch (error) {
            console.error('Failed to load note:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleMinimize = () => {
        getElectronAPI()?.stickyNoteMinimize();
    };

    const handleClose = () => {
        getElectronAPI()?.stickyNoteClose();
    };

    const handleTogglePinned = () => {
        getElectronAPI()?.stickyNoteToggleAlwaysOnTop();
    };

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center" style={{ backgroundColor: note?.color || '#fbbf24' }}>
                <div className="text-white">Loading...</div>
            </div>
        );
    }

    if (!note) {
        return (
            <div className="h-screen flex items-center justify-center bg-gray-900">
                <div className="text-white">Note not found</div>
            </div>
        );
    }

    return (
        // Enhanced sticky note design (still colorful, but refined)
        <div className="h-screen flex flex-col shadow-2xl"
            style={{ backgroundColor: note.color }}>

            {/* Refined title bar with subtle shadow */}
            <div className="drag flex items-center justify-between px-4 py-2.5 
                  border-b border-black/20 bg-black/5">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <h2 className="text-sm font-bold text-gray-900 truncate">
                        {note.title}
                    </h2>
                    <div className="flex items-center gap-2 text-xs">
                        {saving && (
                            <span className="px-2 py-0.5 bg-black/10 rounded-full 
                         text-gray-800 font-medium">
                                Saving...
                            </span>
                        )}
                        {lastSaved && !saving && (
                            <span className="text-gray-700 font-medium">
                                {lastSaved.toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </span>
                        )}
                    </div>
                </div>

                {/* Refined button group */}
                <div className="flex items-center gap-1 no-drag">
                    <button
                        onClick={handleTogglePinned}
                        className={`p-2 rounded-lg transition-all ${alwaysOnTop
                                ? 'bg-black/20 text-gray-900 shadow-sm'
                                : 'hover:bg-black/10 text-gray-600'
                            }`}
                        title={alwaysOnTop ? 'Unpin' : 'Pin on top'}
                    >
                        <Pin className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={handleMinimize}
                        className="p-2 hover:bg-black/10 rounded-lg transition-colors 
                   text-gray-700"
                        title="Minimize"
                    >
                        <Minimize className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-red-500 hover:text-white rounded-lg 
                   transition-colors text-gray-700"
                        title="Close"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Content area with subtle texture */}
            <div className="flex-1 relative">
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="absolute inset-0 p-5 bg-transparent text-gray-900 
                 resize-none focus:outline-none placeholder-gray-600
                 text-sm leading-relaxed"
                    placeholder="Write your note here..."
                    style={{
                        fontFamily: 'system-ui, -apple-system, sans-serif'
                    }}
                />
            </div>

            {/* Optional: Subtle footer with character count */}
            <div className="px-4 py-2 border-t border-black/10 bg-black/5">
                <span className="text-xs text-gray-700 font-medium">
                    {content.length} characters
                </span>
            </div>
        </div>
    );
}