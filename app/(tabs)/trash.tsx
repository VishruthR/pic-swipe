import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TrashStorage } from '@/utils/trash-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import React, { useEffect, useState } from 'react';
import { Alert, Dimensions, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


const { width: screenWidth } = Dimensions.get('window');
const PHOTO_SIZE = (screenWidth - 60) / 3; // 3 photos per row with padding

export default function TrashScreen() {
  const [trashedPhotos, setTrashedPhotos] = useState<MediaLibrary.Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<MediaLibrary.PermissionStatus | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    checkPermissions();
  }, []);

  // Refresh trash when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (permissionStatus === 'granted') {
        loadTrashedPhotos();
      } else {
        checkPermissions();
      }
    }, [])
  );

  const checkPermissions = async () => {
    const { status } = await MediaLibrary.getPermissionsAsync();
    setPermissionStatus(status);
    if (status === 'granted') {
      loadTrashedPhotos();
    }
  };

  const loadTrashedPhotos = async () => {
    try {
      setLoading(true);
      const trashIds = await TrashStorage.getTrashPhotoIds();
      
      if (trashIds.length === 0) {
        setTrashedPhotos([]);
        return;
      }

      const assetPromises = trashIds.map(id => MediaLibrary.getAssetInfoAsync(id));
      const trashedPhotoAssets = await Promise.all(assetPromises);

      setTrashedPhotos(trashedPhotoAssets);
    } catch (error) {
      console.error('Error loading trashed photos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEmptyTrash = () => {
    if (trashedPhotos.length === 0) return;

    Alert.alert(
      'Empty Trash',
      `Are you sure you want to permanently delete ${trashedPhotos.length} photo(s)? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await MediaLibrary.deleteAssetsAsync(trashedPhotos);
              await TrashStorage.emptyTrash();
              setTrashedPhotos([]);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete some photos.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleRestorePhoto = (photo: MediaLibrary.Asset) => {
    Alert.alert(
      'Restore Photo',
      'Do you want to recover this photo from trash?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'default',
          onPress: async () => {
            try {
              await TrashStorage.removeFromTrash(photo.id);
              // Remove from local state optimistically for better UX
              setTrashedPhotos(prev => prev.filter(p => p.id !== photo.id));
            } catch (error) {
              Alert.alert('Error', 'Failed to restore photo.');
            }
          },
        },
      ]
    );
  };

  const renderPhoto = ({ item }: { item: MediaLibrary.Asset }) => (
    <TouchableOpacity 
      style={styles.photoItem}
      onPress={() => handleRestorePhoto(item)}
      activeOpacity={0.7}
    >
      <Image
        source={{ uri: item.uri }}
        style={styles.photo}
        contentFit="cover"
      />
    </TouchableOpacity>
  );

  if (permissionStatus !== 'granted') {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top + 20 }]}>
        <ThemedText style={styles.centerText}>
          Photo library access required to view trash
        </ThemedText>
      </ThemedView>
    );
  }

  if (loading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top + 20 }]}>
        <ThemedText style={styles.centerText}>Loading trash...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <View style={styles.header}>
        <ThemedText type="title" style={styles.title}>
          Trash ({trashedPhotos.length})
        </ThemedText>
        
        {trashedPhotos.length > 0 && (
          <TouchableOpacity 
            style={styles.emptyButton} 
            onPress={handleEmptyTrash}
            disabled={loading}
          >
            <ThemedText style={styles.emptyButtonText}>Empty Trash</ThemedText>
          </TouchableOpacity>
        )}
      </View>

      {trashedPhotos.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ThemedText style={styles.emptyText}>Trash is empty</ThemedText>
          <ThemedText style={styles.emptySubtext}>
            Photos you swipe left will appear here
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={trashedPhotos}
          renderItem={renderPhoto}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={styles.photoGrid}
          showsVerticalScrollIndicator={false}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  emptyButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    opacity: 0.7,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.5,
    textAlign: 'center',
  },
  centerText: {
    textAlign: 'center',
    fontSize: 16,
  },
  photoGrid: {
    paddingBottom: 20,
  },
  photoItem: {
    flex: 1,
    margin: 5,
    maxWidth: PHOTO_SIZE,
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 8,
  },
});
