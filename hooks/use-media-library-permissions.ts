import { useFocusEffect } from '@react-navigation/native';
import * as MediaLibrary from 'expo-media-library';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseMediaLibraryPermissionsOptions {
  /**
   * Callback function to execute when permissions are granted
   */
  onGranted?: () => void | Promise<void>;
  
  /**
   * Whether to check permissions when the screen comes into focus
   * Useful for tab screens that might need to refresh permission status
   */
  checkOnFocus?: boolean;
  
  /**
   * Whether to automatically request permissions if they're not granted
   * If false, you'll need to call requestPermissions manually
   */
  autoRequest?: boolean;
}

export interface UseMediaLibraryPermissionsReturn {
  /**
   * Current permission status
   */
  permissionStatus: MediaLibrary.PermissionStatus | null;
  
  /**
   * Function to manually request permissions
   */
  requestPermissions: () => Promise<void>;
  
  /**
   * Function to manually check current permission status
   */
  checkPermissions: () => Promise<void>;
  
  /**
   * Whether permissions are currently being checked
   */
  isChecking: boolean;
}

/**
 * Custom hook for managing MediaLibrary permissions
 * 
 * @param options Configuration options for permission handling
 * @returns Object containing permission status and control functions
 * 
 * @example
 */
export function useMediaLibraryPermissions(
  options: UseMediaLibraryPermissionsOptions = {}
): UseMediaLibraryPermissionsReturn {
  const { onGranted, checkOnFocus = false, autoRequest = false } = options;
  
  const [permissionStatus, setPermissionStatus] = useState<MediaLibrary.PermissionStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  
  // Use ref to store the latest onGranted callback to avoid dependency issues
  const onGrantedRef = useRef(onGranted);
  useEffect(() => {
    onGrantedRef.current = onGranted;
  }, [onGranted]);

  const checkPermissions = useCallback(async () => {
    try {
      setIsChecking(true);
      const { status } = await MediaLibrary.getPermissionsAsync();
      setPermissionStatus(status);
      
      if (status === 'granted' && onGrantedRef.current) {
        await onGrantedRef.current();
      }
    } catch (error) {
      console.error('Error checking MediaLibrary permissions:', error);
    } finally {
      setIsChecking(false);
    }
  }, [autoRequest]);

  const requestPermissions = useCallback(async () => {
    try {
      setIsChecking(true);
      console.log('Requesting MediaLibrary permissions');
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setPermissionStatus(status);

      console.log('MediaLibrary permissions requested', status);
      if (status === 'granted' && onGrantedRef.current) {
        await onGrantedRef.current();
      }
    } catch (error) {
      console.error('Error requesting MediaLibrary permissions:', error);
    } finally {
      setIsChecking(false);
    }
  }, []);


  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);


  useEffect(() => {
    if (permissionStatus === 'denied' && autoRequest) {
      requestPermissions();
    }
  }, [permissionStatus, autoRequest, requestPermissions]);


  useFocusEffect(
    useCallback(() => {
      if (checkOnFocus) {
        if (permissionStatus === 'granted' && onGrantedRef.current) {
          onGrantedRef.current();
        } else {
          checkPermissions();
        }
      }
    }, [checkOnFocus, permissionStatus, checkPermissions])
  );

  return {
    permissionStatus,
    requestPermissions,
    checkPermissions,
    isChecking,
  };
}
