import AsyncStorage from '@react-native-async-storage/async-storage';

// AsyncStorage key for trash photo IDs
const TRASH_STORAGE_KEY = '@pic_swipe_trash_photos';

// In-memory cache for performance
let trashPhotoIdsCache = new Set<string>();
let isTrashLoaded = false;

// Load trash from AsyncStorage
const loadTrashFromStorage = async (): Promise<void> => {
  try {
    const stored = await AsyncStorage.getItem(TRASH_STORAGE_KEY);
    if (stored) {
      const ids = JSON.parse(stored) as string[];
      trashPhotoIdsCache = new Set(ids);
    }
    isTrashLoaded = true;
  } catch (error) {
    console.error('Failed to load trash from storage:', error);
    isTrashLoaded = true; // Continue with empty cache
  }
};

// Save trash to AsyncStorage
const saveTrashToStorage = async (ids: string[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(ids));
  } catch (error) {
    console.error('Failed to save trash to storage:', error);
  }
};

export const TrashStorage = {
  /**
   * Get all photo IDs in trash
   */
  async getTrashPhotoIds(): Promise<string[]> {
    if (!isTrashLoaded) {
      await loadTrashFromStorage();
    }
    return Array.from(trashPhotoIdsCache);
  },

  /**
   * Add a photo ID to trash
   */
  async addToTrash(photoId: string): Promise<void> {
    if (!isTrashLoaded) {
      await loadTrashFromStorage();
    }
    trashPhotoIdsCache.add(photoId);
    await saveTrashToStorage(Array.from(trashPhotoIdsCache));
  },

  /**
   * Remove all photos from trash (clear trash)
   */
  async emptyTrash(): Promise<void> {
    trashPhotoIdsCache.clear();
    await saveTrashToStorage([]);
  },

  /**
   * Check if a photo ID is in trash
   */
  async isInTrash(photoId: string): Promise<boolean> {
    if (!isTrashLoaded) {
      await loadTrashFromStorage();
    }
    return trashPhotoIdsCache.has(photoId);
  },

  /**
   * Remove a specific photo from trash (restore)
   */
  async removeFromTrash(photoId: string): Promise<void> {
    if (!isTrashLoaded) {
      await loadTrashFromStorage();
    }
    trashPhotoIdsCache.delete(photoId);
    await saveTrashToStorage(Array.from(trashPhotoIdsCache));
  },

  /**
   * Get count of photos in trash
   */
  async getTrashCount(): Promise<number> {
    if (!isTrashLoaded) {
      await loadTrashFromStorage();
    }
    return trashPhotoIdsCache.size;
  },

  /**
   * Preload trash data (call on app startup for better performance)
   */
  async preload(): Promise<void> {
    if (!isTrashLoaded) {
      await loadTrashFromStorage();
    }
  }
};
