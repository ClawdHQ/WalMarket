'use client';
import { create } from 'zustand';
import type { MemoryListing } from '@walmarket/sdk';

interface ListingsState {
  listings: MemoryListing[];
  loading: boolean;
  error: string | null;
  selectedCategory: number | null;
  sortBy: 'newest' | 'price-asc' | 'price-desc' | 'memories' | 'oldest-data';
  searchQuery: string;
  setListings: (listings: MemoryListing[]) => void;
  upsertListing: (listing: MemoryListing) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCategory: (category: number | null) => void;
  setSortBy: (sort: ListingsState['sortBy']) => void;
  setSearchQuery: (q: string) => void;
  getFiltered: () => MemoryListing[];
}

export const useListingsStore = create<ListingsState>((set, get) => ({
  listings: [],
  loading: false,
  error: null,
  selectedCategory: null,
  sortBy: 'newest',
  searchQuery: '',

  setListings: listings => set({ listings }),
  upsertListing: listing => set(s => {
    const idx = s.listings.findIndex(l => l.id === listing.id);
    if (idx === -1) return { listings: [...s.listings, listing] };
    const next = [...s.listings];
    next[idx] = listing;
    return { listings: next };
  }),
  setLoading: loading => set({ loading }),
  setError: error => set({ error }),
  setCategory: category => set({ selectedCategory: category }),
  setSortBy: sortBy => set({ sortBy }),
  setSearchQuery: searchQuery => set({ searchQuery }),

  getFiltered: () => {
    const { listings, selectedCategory, sortBy, searchQuery } = get();
    let result = listings.filter(l => l.isActive);
    if (selectedCategory !== null) result = result.filter(l => l.category === selectedCategory);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l => l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q));
    }
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'newest': return b.createdAt - a.createdAt;
        case 'price-asc': return Number(a.salePriceMist ?? 0n) - Number(b.salePriceMist ?? 0n);
        case 'price-desc': return Number(b.salePriceMist ?? 0n) - Number(a.salePriceMist ?? 0n);
        case 'memories': return b.memoryCount - a.memoryCount;
        case 'oldest-data': return a.oldestMemoryEpoch - b.oldestMemoryEpoch;
        default: return 0;
      }
    });
    return result;
  },
}));
