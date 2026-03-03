import { useMediaLibraryPermissions } from '@/hooks/use-media-library-permissions';
import { TrashStorage } from '@/utils/trash-storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native';
import { IconSymbol } from './ui/icon-symbol';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

const { width: screenWidth } = Dimensions.get('window');
const PHOTO_INDEX_KEY = '@photo_index';
const PRELOAD_AHEAD = 5;

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

interface PhotoData {
  asset: MediaLibrary.Asset;
  info: MediaLibrary.AssetInfo | null;
}

export default function RandomPhotoPicker() {
  const [currentPhoto, setCurrentPhoto] = useState<PhotoData | null>(null);
  const [nextPhotos, setNextPhotos] = useState<PhotoData[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const isLoadingNext = useRef(false);
  const currentIndexRef = useRef(0);

  const getPhotoAtIndex = useCallback(async (index: number): Promise<MediaLibrary.Asset | null> => {
    try {
      if (index === 0) {
        const result = await MediaLibrary.getAssetsAsync({
          mediaType: 'photo',
          first: 1,
          sortBy: ['creationTime', true],
        });
        return result.assets[0] || null;
      }

      const cursorResult = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: index,
        sortBy: [[MediaLibrary.SortBy.creationTime, true]],
      });

      if (!cursorResult.hasNextPage) return null;

      const photoResult = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: 1,
        after: cursorResult.endCursor,
        sortBy: [[MediaLibrary.SortBy.creationTime, true]],
      });

      return photoResult.assets[0] || null;
    } catch (error) {
      console.error('Error getting photo at index:', error);
      return null;
    }
  }, []);

  const loadPhotoData = useCallback(async (index: number): Promise<PhotoData | null> => {
    const asset = await getPhotoAtIndex(index);
    if (!asset) return null;

    let info: MediaLibrary.AssetInfo | null = null;
    try {
      info = await MediaLibrary.getAssetInfoAsync(asset.id);
    } catch (error) {
      console.error('Error loading photo info:', error);
    }

    return { asset, info };
  }, [getPhotoAtIndex]);

  // Fill the preload queue up to PRELOAD_AHEAD photos beyond currentIndex
  const fillPreloadQueue = useCallback(async (fromIndex: number, existing: PhotoData[]) => {
    if (isLoadingNext.current) return;
    isLoadingNext.current = true;

    try {
      const needed = PRELOAD_AHEAD - existing.length;
      if (needed <= 0) return;

      const newPhotos: PhotoData[] = [];
      for (let i = 0; i < needed; i++) {
        const idx = fromIndex + existing.length + newPhotos.length + 1;
        const photo = await loadPhotoData(idx);
        if (!photo) break;
        // Prefetch into expo-image cache
        Image.prefetch(photo.asset.uri);
        newPhotos.push(photo);
      }

      if (newPhotos.length > 0) {
        setNextPhotos(prev => [...prev, ...newPhotos]);
      }
    } catch (error) {
      console.error('Error preloading photos:', error);
    } finally {
      isLoadingNext.current = false;
    }
  }, [loadPhotoData]);

  const saveIndex = useCallback((index: number) => {
    AsyncStorage.setItem(PHOTO_INDEX_KEY, index.toString())
      .catch(err => console.error('Failed to save photo index:', err));
  }, []);

  const loadInitialPhotos = useCallback(async (totalCount: number) => {
    if (totalCount === 0) return;

    try {
      const stored = await AsyncStorage.getItem(PHOTO_INDEX_KEY);
      const savedIndex = stored ? parseInt(stored, 10) : 0;
      const startIndex = Math.min(Math.max(savedIndex, 0), totalCount - 1);
      currentIndexRef.current = startIndex;

      const firstPhoto = await loadPhotoData(startIndex);
      if (firstPhoto) {
        setCurrentPhoto(firstPhoto);
        fillPreloadQueue(startIndex, []);
      }
    } catch (error) {
      console.error('Error loading initial photos:', error);
    }
  }, [loadPhotoData, fillPreloadQueue]);

  const initializePhotos = useCallback(async () => {
    try {
      setLoading(true);
      setHasError(false);

      const totalAssets = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: 1,
      });

      if (totalAssets.totalCount > 0) {
        await loadInitialPhotos(totalAssets.totalCount);
      } else {
        setHasError(true);
      }
    } catch (error) {
      setHasError(true);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [loadInitialPhotos]);

  const { permissionStatus, requestPermissions } = useMediaLibraryPermissions({
    onGranted: initializePhotos,
  });

  // Whenever nextPhotos changes, top up the queue if needed
  useEffect(() => {
    if (nextPhotos.length < PRELOAD_AHEAD && !isLoadingNext.current) {
      fillPreloadQueue(currentIndexRef.current, nextPhotos);
    }
  }, [nextPhotos, fillPreloadQueue]);

  const advance = useCallback(() => {
    if (nextPhotos.length === 0) return false;

    const [next, ...rest] = nextPhotos;
    currentIndexRef.current++;
    saveIndex(currentIndexRef.current);
    setCurrentPhoto(next);
    setNextPhotos(rest);
    return true;
  }, [nextPhotos, saveIndex]);

  const handleKeep = useCallback(() => {
    advance();
  }, [advance]);

  const handleDelete = useCallback(async () => {
    if (!currentPhoto) return;
    await TrashStorage.addToTrash(currentPhoto.asset.id);
    advance();
  }, [currentPhoto, advance]);

  if (permissionStatus !== MediaLibrary.PermissionStatus.GRANTED) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.centerText}>
          {permissionStatus === null ? 'Checking permissions...' : 'Photo access required'}
        </ThemedText>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermissions}>
          <ThemedText style={styles.permissionButtonText}>Grant Permission</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  if (loading || !initialized) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.centerText}>Loading photos...</ThemedText>
      </ThemedView>
    );
  }

  if (hasError || !currentPhoto) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.centerText}>
          {hasError ? 'No photos found' : 'No photo selected'}
        </ThemedText>
        <TouchableOpacity style={[styles.permissionButton, { backgroundColor: '#34C759' }]} onPress={initializePhotos}>
          <ThemedText style={styles.permissionButtonText}>Load Photos</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  const ready = nextPhotos.length > 0;

  return (
    <ThemedView style={styles.root}>
      {/* Photo */}
      <View style={styles.photoWrapper}>
        <Image
          source={{ uri: currentPhoto.asset.uri }}
          style={styles.photo}
          contentFit="contain"
          priority="high"
        />
      </View>

      {/* Date */}
      {currentPhoto.info && (
        <ThemedText style={styles.dateText}>
          {formatTime(currentPhoto.info.creationTime)}
        </ThemedText>
      )}

      {/* Action buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton, !ready && styles.buttonDisabled]}
          onPress={handleDelete}
          activeOpacity={0.75}
          disabled={!ready}
        >
          <IconSymbol name="trash" size={32} color="#fff" weight="semibold" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.keepButton, !ready && styles.buttonDisabled]}
          onPress={handleKeep}
          activeOpacity={0.75}
          disabled={!ready}
        >
          <IconSymbol name="checkmark" size={32} color="#fff" weight="semibold" />
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 40,
    paddingHorizontal: 20,
    gap: 16,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 20,
  },
  photoWrapper: {
    flex: 1,
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  dateText: {
    fontSize: 13,
    opacity: 0.6,
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 32,
  },
  actionButton: {
    width: screenWidth * 0.28,
    height: screenWidth * 0.28,
    borderRadius: screenWidth * 0.14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
  },
  keepButton: {
    backgroundColor: '#34C759',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  permissionButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#007AFF',
  },
  permissionButtonText: {
    fontWeight: '600',
    fontSize: 16,
    color: '#fff',
  },
  centerText: {
    textAlign: 'center',
    fontSize: 16,
    marginBottom: 16,
  },
});
