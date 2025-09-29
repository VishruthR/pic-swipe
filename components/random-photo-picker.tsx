import { TrashStorage } from '@/utils/trash-storage';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import React, { useEffect, useState } from 'react';
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

const { width: screenWidth } = Dimensions.get('window');
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

export default function RandomPhotoPicker() {
  const [currentPhoto, setCurrentPhoto] = useState<MediaLibrary.Asset | null>(null);
  const [currentPhotoInfo, setCurrentPhotoInfo] = useState<MediaLibrary.AssetInfo | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<MediaLibrary.PermissionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [totalPhotoCount, setTotalPhotoCount] = useState(0);
  const [lastPhotoId, setLastPhotoId] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  
  // Animated values for current photo swipe gestures
  const translateX = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);
  
  // Animated values for new photo sliding in from top
  const slideInTranslateY = useSharedValue(0);
  const slideInOpacity = useSharedValue(1);

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    const { status } = await MediaLibrary.getPermissionsAsync();
    setPermissionStatus(status);
    if (status === 'granted') {
      initializePhotos();
    }
  };

  const requestPermissions = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    setPermissionStatus(status);
    if (status === 'granted') {
      initializePhotos();
    }
  };

  const initializePhotos = async () => {
    try {
      setLoading(true);
      setHasError(false);
      
      const totalAssets = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: 1,
      });
      
      if (totalAssets.totalCount > 0) {
        setTotalPhotoCount(totalAssets.totalCount);
        await loadRandomPhoto();
      } else {
        setHasError(true);
      }
    } catch (error) {
      setHasError(true);
    } finally {
      setLoading(false);
    }
  };

  const getRandomPhoto = async (excludeIds: string[] = []): Promise<MediaLibrary.Asset | null> => {
    if (totalPhotoCount === 0) return null;
    
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
  };

  const animatePhotoIn = () => {
    translateX.value = 0;
    rotate.value = 0;
    opacity.value = 1;

    slideInTranslateY.value = -screenWidth;
    slideInOpacity.value = 0;
    
    slideInTranslateY.value = withTiming(0, {duration: 400});
    slideInOpacity.value = withTiming(1, {duration: 400});
  }

  const loadRandomPhoto = async () => {
    const photo = await getRandomPhoto([lastPhotoId || '']);
    if (photo) {
      setCurrentPhoto(photo);
      setLastPhotoId(photo.id);
      
      // Fetch detailed info for the current photo
      try {
        const photoInfo = await MediaLibrary.getAssetInfoAsync(photo.id);
        setCurrentPhotoInfo(photoInfo);
      } catch (error) {
        console.error('Error loading photo info:', error);
        setCurrentPhotoInfo(null);
      }

      animatePhotoIn();
    }
  };
  
  const loadNewPhoto = async () => {
    await loadRandomPhoto();
  };

  const handleSkip = () => loadNewPhoto();

  const handleDelete = async () => {
    if (!currentPhoto) return;
    
    await TrashStorage.addToTrash(currentPhoto.id);
    
    const trashCount = await TrashStorage.getTrashCount();
    if (totalPhotoCount - trashCount <= 1) {
      initializePhotos();
    } else {
      loadNewPhoto();
    }
  };

  const animateOut = (direction: 'left' | 'right') => {
    const targetX = direction === 'left' ? -screenWidth * 1.5 : screenWidth * 1.5;
    
    translateX.value = withSpring(targetX, { damping: 15, stiffness: 100 });
    rotate.value = withSpring(direction === 'left' ? -30 : 30);
    opacity.value = withSpring(0);
    const action = direction === 'right' ? handleSkip : handleDelete;
    action();
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      rotate.value = event.translationX / 10;
      opacity.value = 1 - Math.abs(event.translationX) / (screenWidth * 0.8);
    })
    .onEnd((event) => {
      const shouldSwipe = Math.abs(event.translationX) > SWIPE_THRESHOLD;
      
      if (shouldSwipe) {
        const direction = event.translationX > 0 ? 'right' : 'left';
        scheduleOnRN(animateOut, direction);
      } else {
        translateX.value = withSpring(0);
        rotate.value = withSpring(0);
        opacity.value = withSpring(1);
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: slideInTranslateY.value },
        { rotate: `${rotate.value}deg` },
      ],
      opacity: opacity.value * slideInOpacity.value,
    };
  });

  if (permissionStatus !== 'granted') {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.centerText}>
          {permissionStatus === null ? 'Checking permissions...' : 'Photo access required'}
        </ThemedText>
        {permissionStatus === 'denied' && (
          <TouchableOpacity style={styles.button} onPress={requestPermissions}>
            <ThemedText style={styles.buttonText}>Grant Permission</ThemedText>
          </TouchableOpacity>
        )}
      </ThemedView>
    );
  }

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.centerText}>Loading photos...</ThemedText>
      </ThemedView>
    );
  }

  if (!currentPhoto || hasError) {
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
        {/* Current photo - interactive with gestures and slide-in animation */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.photoContainer, animatedStyle]}>
            <Image source={{ uri: currentPhoto.uri }} style={styles.photo} contentFit="contain" />
          </Animated.View>
        </GestureDetector>
      </View>
      
      {/* Photo time display underneath the photo */}
      {currentPhotoInfo && (
        <ThemedText style={styles.photoTimeText}>
          {formatTime(currentPhotoInfo.creationTime)}
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
    color: 'white',
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
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
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
