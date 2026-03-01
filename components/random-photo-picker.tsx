import { useMediaLibraryPermissions } from '@/hooks/use-media-library-permissions';
import { TrashStorage } from '@/utils/trash-storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
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
const PHOTO_INDEX_KEY = '@photo_index';

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
  const [currentPhoto, setCurrentPhoto] = useState<PhotoData | null>(null);
  const [nextPhoto, setNextPhoto] = useState<PhotoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const isLoadingNext = useRef(false);
  const currentIndexRef = useRef(0);

  // Animation values for current photo
  const currentTranslateX = useSharedValue(0);
  const currentRotate = useSharedValue(0);
  const currentOpacity = useSharedValue(1);

  // Animation values for next photo
  const nextTranslateY = useSharedValue(-screenHeight);
  const nextOpacity = useSharedValue(0);

  const showNext = useSharedValue(0); // 0 = current, 1 = next

  // Fetch the photo at a specific 0-based position (oldest first)
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

      // Two-call approach: fetch N items to get cursor at position index-1,
      // then fetch the single photo right after that cursor
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

  useEffect(() => {
    if (nextPhoto) {
      nextTranslateY.value = -screenHeight;
      nextOpacity.value = 0;
    }
  }, [nextPhoto])

  const preloadNextPhoto = useCallback(async (nextIndex: number): Promise<PhotoData | null> => {
    if (isLoadingNext.current) return null;

    isLoadingNext.current = true;
    try {
      const photoData = await loadPhotoData(nextIndex);
      if (photoData) {
        setNextPhoto(photoData);
        return photoData;
      }
      return null;
    } catch (error) {
      console.error('Error preloading next photo:', error);
      return null;
    } finally {
      isLoadingNext.current = false;
    }
  }, [loadPhotoData]);

  useEffect(() => {
    // 100ms timeout to avoid flicker of old photo
    const timeoutId = setTimeout(() => {
      currentTranslateX.value = 0;
      currentRotate.value = 0;
      currentOpacity.value = 1;

      showNext.value = 0;

      preloadNextPhoto(currentIndexRef.current + 1);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [currentPhoto, preloadNextPhoto, currentTranslateX, currentRotate, currentOpacity, showNext])

  const transitionToNext = useCallback((onCommit?: () => void) => {
    if (!nextPhoto) return;

    const transitionNextToCurrent = () => {
      if (!nextPhoto) return;
      onCommit?.();
      setCurrentPhoto(nextPhoto);
    }

    nextTranslateY.value = withTiming(0, { duration: 200 });
    nextOpacity.value = withTiming(1, { duration: 200 });
    showNext.value = withTiming(1, { duration: 200 }, (finished) => {
      if (finished) {
        scheduleOnRN(transitionNextToCurrent);
      }
    });
  }, [nextPhoto, nextTranslateY, nextOpacity, showNext]);

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
        preloadNextPhoto(startIndex + 1);
      }
    } catch (error) {
      console.error('Error loading initial photos:', error);
    }
  }, [loadPhotoData, preloadNextPhoto]);

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

  const commitTransition = useCallback(() => {
    currentIndexRef.current++;
    saveIndex(currentIndexRef.current);
  }, [saveIndex]);

  const handleSkip = useCallback(async () => {
    let photoToTransitionTo = nextPhoto;
    if (!nextPhoto) {
      photoToTransitionTo = await preloadNextPhoto(currentIndexRef.current + 1);
    }

    if (photoToTransitionTo) {
      transitionToNext(commitTransition);
    }
  }, [nextPhoto, transitionToNext, preloadNextPhoto, commitTransition]);

  const handleDelete = useCallback(async () => {
    if (!currentPhoto) return;

    await TrashStorage.addToTrash(currentPhoto.asset.id);

    let photoToTransitionTo = nextPhoto;
    if (!nextPhoto) {
      photoToTransitionTo = await preloadNextPhoto(currentIndexRef.current + 1);
    }

    if (photoToTransitionTo) {
      transitionToNext(commitTransition);
    }
  }, [currentPhoto, nextPhoto, transitionToNext, preloadNextPhoto, commitTransition]);

  const switchPhotosAfterAnimation = useCallback((direction: 'left' | 'right') => {
    const action = direction === 'right' ? handleSkip : handleDelete;
    action();
  }, [handleSkip, handleDelete]);

  const animateOut = (direction: 'left' | 'right') => {
    const targetX = direction === 'left' ? -screenWidth * 1.5 : screenWidth * 1.5;

    currentTranslateX.value = withTiming(targetX, { duration: 400 });
    currentRotate.value = withTiming(direction === 'left' ? -30 : 30, { duration: 400 });
    currentOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
      if (finished) {
        scheduleOnRN(switchPhotosAfterAnimation, direction);
      }
    });
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      currentTranslateX.value = event.translationX;
      currentRotate.value = event.translationX / 10;
      currentOpacity.value = 1 - Math.abs(event.translationX) / (screenWidth * 0.8);
    })
    .onEnd((event) => {
      const shouldSwipe = Math.abs(event.translationX) > SWIPE_THRESHOLD;

      if (shouldSwipe) {
        const direction = event.translationX > 0 ? 'right' : 'left';
        scheduleOnRN(animateOut, direction);
      } else {
        currentTranslateX.value = withSpring(0);
        currentRotate.value = withSpring(0);
        currentOpacity.value = withSpring(1);
      }
    });

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
        <TouchableOpacity style={[styles.button, styles.retryButton]} onPress={initializePhotos}>
          <ThemedText style={styles.buttonText}>Load Photos</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.photoStackContainer}>
        {/* Current Photo */}
        {currentPhoto && (
          <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.photoContainer, currentPhotoStyle]}>
              <Image
                source={{ uri: currentPhoto.asset.uri }}
                style={styles.photo}
                contentFit="contain"
                priority="high"
              />
            </Animated.View>
          </GestureDetector>
        )}

        {/* Next Photo (preloaded, slides in from top) */}
        {nextPhoto && (
          <Animated.View style={[styles.photoContainer, styles.nextPhotoContainer, nextPhotoStyle]}>
            <Image
              source={{ uri: nextPhoto.asset.uri }}
              style={styles.photo}
              contentFit="contain"
              priority="normal"
            />
          </Animated.View>
        )}
      </View>

      {currentPhoto?.info && (
        <ThemedText style={styles.photoTimeText}>
          {formatTime(currentPhoto.info.creationTime)}
        </ThemedText>
      )}

      <View style={styles.instructionsContainer}>
        <View style={styles.instructionRow}>
          <View style={[styles.instructionDot, styles.deleteDot]} />
          <ThemedText style={styles.instructionText}>Swipe left to delete</ThemedText>
        </View>
        <View style={styles.instructionRow}>
          <View style={[styles.instructionDot, styles.keepDot]} />
          <ThemedText style={styles.instructionText}>Swipe right to keep</ThemedText>
        </View>
      </View>
    </ThemedView>
  );
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
