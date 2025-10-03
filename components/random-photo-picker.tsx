import { useMediaLibraryPermissions } from '@/hooks/use-media-library-permissions';
import { TrashStorage } from '@/utils/trash-storage';
import * as MediaLibrary from 'expo-media-library';
import React, { useCallback, useRef, useState } from 'react';
import { Dimensions, StyleSheet, TouchableOpacity } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const SWIPE_THRESHOLD = screenWidth * 0.3;

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

interface PhotoData {
  asset: MediaLibrary.Asset;
  info: MediaLibrary.AssetInfo | null;
}

export default function RandomPhotoPicker() {
  // Photo queue system - current and next photo ready
  const [currentPhoto, setCurrentPhoto] = useState<PhotoData | null>(null);
  const [nextPhoto, setNextPhoto] = useState<PhotoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [totalPhotoCount, setTotalPhotoCount] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [initialized, setInitialized] = useState(false);
  
  const isLoadingNext = useRef(false);
  
  // Animation values for current photo
  const currentTranslateX = useSharedValue(0);
  const currentRotate = useSharedValue(0);
  const currentOpacity = useSharedValue(1);
  
  // Animation values for next photo 
  const nextTranslateY = useSharedValue(-screenHeight);
  const nextOpacity = useSharedValue(0);
  
  const showNext = useSharedValue(0); // 0 = current, 1 = next

  const getRandomPhoto = useCallback(async (excludeIds: string[] = []): Promise<MediaLibrary.Asset | null> => {
    // Try 10 times to get a random photo
    for (let attempt = 0; attempt < 10; attempt++) {
      const randomIndex = Math.floor(Math.random() * totalPhotoCount);
      
      try {
        const assets = await MediaLibrary.getAssetsAsync({
          mediaType: 'photo',
          first: 1,
          after: randomIndex > 0 ? (await MediaLibrary.getAssetsAsync({
            mediaType: 'photo',
            first: randomIndex,
          })).endCursor : undefined,
        });
        
        const photo = assets.assets[0];
        if (!photo) continue;
        
        const isTrash = await TrashStorage.isInTrash(photo.id);
        if (!isTrash && !excludeIds.includes(photo.id)) {
          return photo;
        }
      } catch (error) {
        continue;
      }
    }
    return null;
  }, [totalPhotoCount]);

  const loadPhotoData = useCallback(async (excludeIds: string[] = []): Promise<PhotoData | null> => {
    const asset = await getRandomPhoto(excludeIds);
    if (!asset) return null;

    // Load photo info in parallel with asset
    let info: MediaLibrary.AssetInfo | null = null;
    try {
      info = await MediaLibrary.getAssetInfoAsync(asset.id);
    } catch (error) {
      console.error('Error loading photo info:', error);
    }

    return { asset, info };
  }, [getRandomPhoto]);

  // Preload the next photo in background
  const preloadNextPhoto = useCallback(async () => {
    if (isLoadingNext.current || totalPhotoCount === 0) return;
    
    isLoadingNext.current = true;
    try {
      console.log('[preloadNextPhoto] start', { excludeId: currentPhoto?.asset.id });
      const photoData = await loadPhotoData([currentPhoto?.asset.id ?? '']);
      
      if (photoData) {
        console.log('[preloadNextPhoto] loaded next photo', { id: photoData.asset.id });
        setNextPhoto(photoData);
        // Reset next photo animation values
        nextTranslateY.value = -screenHeight;
        nextOpacity.value = 0;
      }
    } catch (error) {
      console.error('Error preloading next photo:', error);
    } finally {
      console.log('[preloadNextPhoto] end');
      isLoadingNext.current = false;
    }
  }, [totalPhotoCount, loadPhotoData, nextTranslateY, nextOpacity]);

  // Animate transition to next photo
  const transitionToNext = useCallback(() => {
    if (!nextPhoto) return;

    console.log('[transitionToNext] animating in next photo', { id: nextPhoto.asset.id });
    nextTranslateY.value = withTiming(0, { duration: 400 });
    nextOpacity.value = withTiming(1, { duration: 400 });
    showNext.value = withTiming(1, { duration: 400 }, (finished) => {
      if (finished) {
        // Move state updates back to JS
        scheduleOnRN(() => {
          console.log('[transitionToNext] completed, swapping to next photo');
          setCurrentPhoto(nextPhoto);
          setNextPhoto(null);

          currentTranslateX.value = 0;
          currentRotate.value = 0;
          currentOpacity.value = 1;

          showNext.value = 0;

          preloadNextPhoto();
        });
      }
    });
  }, [nextPhoto, nextTranslateY, nextOpacity, showNext, currentTranslateX, currentRotate, currentOpacity, preloadNextPhoto]);

  const loadInitialPhotos = useCallback(async (numPhotos: number | null = null) => {
    if (numPhotos === 0 || (numPhotos === null && totalPhotoCount === 0)) return;

    try {
      // Load first photo
      console.log('[loadInitialPhotos] start');
      const firstPhoto = await loadPhotoData();
      if (firstPhoto) {
        console.log('[loadInitialPhotos] first photo loaded', { id: firstPhoto.asset.id });
        setCurrentPhoto(firstPhoto);
        // Start preloading next photo immediately
        preloadNextPhoto();
      }
    } catch (error) {
      console.error('Error loading initial photos:', error);
    }
  }, [totalPhotoCount, loadPhotoData, preloadNextPhoto]);

  const initializePhotos = useCallback(async () => {
    try {
      console.log('[initializePhotos] start');
      setLoading(true);
      setHasError(false);
      
      const totalAssets = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: 1,
      });
      
      if (totalAssets.totalCount > 0) {
        console.log('[initializePhotos] totalCount', totalAssets.totalCount);
        setTotalPhotoCount(totalAssets.totalCount);
        await loadInitialPhotos(totalAssets.totalCount);
      } else {
        setHasError(true);
      }
    } catch (error) {
      setHasError(true);
    } finally {
      console.log('[initializePhotos] end');
      setLoading(false);
      setInitialized(true);
    }
  }, [loadInitialPhotos]);

  const { permissionStatus, requestPermissions } = useMediaLibraryPermissions({
    onGranted: initializePhotos,
  });
  
  const handleSkip = useCallback(() => {
    console.log('[handleSkip] invoked');
    if (nextPhoto) {
      transitionToNext();
    } else {
      // Fallback: preload next photo if not ready
      preloadNextPhoto();
    }
  }, [nextPhoto, transitionToNext, preloadNextPhoto]);

  const handleDelete = useCallback(async () => {
    if (!currentPhoto) return;
    
    console.log('[handleDelete] adding to trash', { id: currentPhoto.asset.id });
    await TrashStorage.addToTrash(currentPhoto.asset.id);
    
    const trashCount = await TrashStorage.getTrashCount();
    console.log('[handleDelete] trash count', trashCount);
    if (totalPhotoCount - trashCount <= 1) {
      console.log('[handleDelete] near exhaustion, reinitializing');
      initializePhotos();
    } else {
      if (nextPhoto) {
        transitionToNext();
      } else {
        preloadNextPhoto();
      }
    }
  }, [currentPhoto, totalPhotoCount, initializePhotos, nextPhoto, transitionToNext, preloadNextPhoto]);

  const animateOut = (direction: 'left' | 'right') => {
    'worklet';
    console.log('[animateOut] start', direction);
    const targetX = direction === 'left' ? -screenWidth * 1.5 : screenWidth * 1.5;
    
    currentTranslateX.value = withSpring(targetX, { damping: 15, stiffness: 100 });
    currentRotate.value = withSpring(direction === 'left' ? -30 : 30);
    currentOpacity.value = withSpring(0, {}, (finished) => {
      if (finished) {
        // Call back into JS to perform side effects
        scheduleOnRN(() => {
          console.log('[animateOut] finished, invoking action', direction);
          const action = direction === 'right' ? handleSkip : handleDelete;
          action();
        });
      }
    });
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      // gesture update logs kept light to avoid spam; uncomment if needed
      // console.log('[panGesture] update', event.translationX);
      currentTranslateX.value = event.translationX;
      currentRotate.value = event.translationX / 10;
      currentOpacity.value = 1 - Math.abs(event.translationX) / (screenWidth * 0.8);
    })
    .onEnd((event) => {
      console.log('[panGesture] end', event.translationX);
      const shouldSwipe = Math.abs(event.translationX) > SWIPE_THRESHOLD;
      
      if (shouldSwipe) {
        const direction = event.translationX > 0 ? 'right' : 'left';
        // We are on UI thread; call worklet directly
        animateOut(direction);
      } else {
        currentTranslateX.value = withSpring(0);
        currentRotate.value = withSpring(0);
        currentOpacity.value = withSpring(1);
      }
    });

  // Animated styles for current photo
  const currentPhotoStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: currentTranslateX.value },
        { rotate: `${currentRotate.value}deg` },
      ],
      opacity: currentOpacity.value,
      zIndex: showNext.value === 0 ? 2 : 1,
    };
  });

  // Animated styles for next photo (slides in from top)
  const nextPhotoStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: nextTranslateY.value },
      ],
      opacity: nextOpacity.value,
      zIndex: showNext.value === 1 ? 2 : 1,
    };
  });

  if (permissionStatus !== MediaLibrary.PermissionStatus.GRANTED) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.centerText}>
          {permissionStatus === null ? 'Checking permissions...' : 'Photo access required'}
        </ThemedText>
        <TouchableOpacity style={styles.button} onPress={requestPermissions}>
          <ThemedText style={styles.buttonText}>Grant Permission</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 20,
  },
  photo: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  retryButton: {
    backgroundColor: '#34C759',
  },
  buttonText: {
    fontWeight: '600',
    fontSize: 16,
  },
  centerText: {
    textAlign: 'center',
    fontSize: 16,
    marginBottom: 16,
  },
  photoStackContainer: {
    position: 'relative',
    width: screenWidth - 40,
    height: screenWidth - 40,
  },
  photoContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  nextPhotoContainer: {
    // Next photo starts positioned above the screen
    top: 0,
    left: 0,
  },
  instructionsContainer: {
    alignItems: 'center',
    gap: 8,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  instructionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  deleteDot: {
    backgroundColor: '#FF3B30',
  },
  keepDot: {
    backgroundColor: '#34C759',
  },
  instructionText: {
    fontSize: 14,
    opacity: 0.7,
  },
  photoTimeText: {
    textAlign: 'center',
    fontSize: 14,
    opacity: 0.8,
    marginTop: 8,
    fontWeight: '500',
  },
});
