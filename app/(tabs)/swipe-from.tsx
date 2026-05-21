import { usePhotoNavigation } from '@/context/photo-navigation-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as MediaLibrary from 'expo-media-library';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PHOTO_INDEX_KEY = '@photo_index';

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function SwipeFromScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { triggerReset } = usePhotoNavigation();
  const tint = Colors[colorScheme ?? 'light'].tint;

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [maxDate] = useState(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  });
  const [lastLeftOffDate, setLastLeftOffDate] = useState<Date | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    loadLastLeftOffDate();
  });

  const loadLastLeftOffDate = async () => {
    try {
      const stored = await AsyncStorage.getItem(PHOTO_INDEX_KEY);
      const index = stored ? parseInt(stored, 10) : 0;

      const result = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: 1,
        after: index > 0 ? await getCursorAtIndex(index) : undefined,
        sortBy: [[MediaLibrary.SortBy.creationTime, true]],
      });

      const asset = result.assets[0];
      if (asset) {
        setLastLeftOffDate(new Date(asset.creationTime));
      }
    } catch {
      // leave lastLeftOffDate as null
    }
  };

  const getCursorAtIndex = async (index: number): Promise<string | undefined> => {
    if (index === 0) return undefined;
    const cursorResult = await MediaLibrary.getAssetsAsync({
      mediaType: 'photo',
      first: index,
      sortBy: [[MediaLibrary.SortBy.creationTime, true]],
    });
    return cursorResult.endCursor;
  };

  const handleConfirm = useCallback(async () => {
    setConfirming(true);
    try {
      // Count photos created strictly before the selected date to get the
      // index of the first photo at or after the selected date.
      const beforeResult = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: 1,
        createdBefore: selectedDate,
        sortBy: [[MediaLibrary.SortBy.creationTime, true]],
      });

      const totalResult = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: 1,
      });

      const newIndex = Math.min(beforeResult.totalCount, totalResult.totalCount - 1);
      await AsyncStorage.setItem(PHOTO_INDEX_KEY, newIndex.toString());
      triggerReset();
      setConfirming(false);
      router.replace('/(tabs)');
    } catch {
      setConfirming(false);
    }
  }, [selectedDate, triggerReset]);

  const handleLastLeftOff = useCallback(() => {
    router.replace('/(tabs)');
  }, []);
  
  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <ThemedText style={styles.title}>Swipe from</ThemedText>
      <ThemedText style={styles.subtitle}>Pick a date to start swiping from</ThemedText>

      <View style={styles.pickerWrapper}>
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="inline"
          maximumDate={maxDate}
          onChange={(_, date) => { if (date) setSelectedDate(date); }}
          accentColor={tint}
          themeVariant={colorScheme ?? 'light'}
        />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.confirmButton, { backgroundColor: tint }, confirming && styles.buttonDisabled]}
          onPress={handleConfirm}
          disabled={confirming}
          activeOpacity={0.8}
        >
          {confirming
            ? <ActivityIndicator color="#fff" />
            : <ThemedText style={styles.confirmText}>Swipe from {formatDate(selectedDate)}</ThemedText>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.lastLeftOffButton}
          onPress={handleLastLeftOff}
          activeOpacity={0.7}
        >
          <ThemedText style={styles.lastLeftOffText}>
            {lastLeftOffDate
              ? `Where I left off  ·  ${formatDate(lastLeftOffDate)}`
              : 'Where I left off'}
          </ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.5,
    marginBottom: 16,
  },
  pickerWrapper: {
    flex: 1,
  },
  actions: {
    gap: 12,
  },
  confirmButton: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  confirmText: {
    color: 'black',
    fontWeight: '600',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  lastLeftOffButton: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(128,128,128,0.3)',
  },
  lastLeftOffText: {
    fontWeight: '500',
    fontSize: 15,
    opacity: 0.7,
  },
});
