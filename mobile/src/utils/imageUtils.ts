import { Platform } from 'react-native';
import RNFS from 'react-native-fs';

/**
 * Converts an image file path to a base64 data URL
 * @param imagePath - Local file path to the image
 * @param quality - JPEG quality (0-1), defaults to 0.8 (unused for now)
 * @returns Promise resolving to base64 data URL string
 */
export async function imageToBase64DataUrl(
  imagePath: string,
  quality: number = 0.8
): Promise<string> {
  try {
    console.log('[IMAGE UTILS] Starting base64 conversion for path:', imagePath);
    
    // Format the file path for the current platform
    const formattedPath = formatFilePath(imagePath);
    console.log('[IMAGE UTILS] Formatted path:', formattedPath);
    
    // Check if file exists
    const fileExists = await RNFS.exists(formattedPath);
    console.log('[IMAGE UTILS] File exists:', fileExists);
    
    if (!fileExists) {
      throw new Error(`File does not exist at path: ${formattedPath}`);
    }
    
    // Get file info
    const stats = await RNFS.stat(formattedPath);
    console.log('[IMAGE UTILS] File stats:', { size: stats.size, isFile: stats.isFile() });
    
    // Read the file as base64
    const base64String = await RNFS.readFile(formattedPath, 'base64');
    console.log('[IMAGE UTILS] Base64 conversion successful, length:', base64String.length);
    
    // Determine the MIME type based on file extension
    const extension = formattedPath.split('.').pop()?.toLowerCase();
    let mimeType = 'image/jpeg'; // default
    
    switch (extension) {
      case 'png':
        mimeType = 'image/png';
        break;
      case 'jpg':
      case 'jpeg':
        mimeType = 'image/jpeg';
        break;
      case 'gif':
        mimeType = 'image/gif';
        break;
      case 'webp':
        mimeType = 'image/webp';
        break;
    }
    
    console.log('[IMAGE UTILS] Detected MIME type:', mimeType);
    
    // Create data URL
    const dataUrl = `data:${mimeType};base64,${base64String}`;
    console.log('[IMAGE UTILS] Data URL created, total length:', dataUrl.length);
    
    return dataUrl;
  } catch (error) {
    console.error('[IMAGE UTILS] Error in imageToBase64DataUrl:', error);
    console.error('[IMAGE UTILS] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    throw error;
  }
}

/**
 * Gets file size in bytes
 * @param filePath - Path to the file
 * @returns Promise resolving to file size in bytes
 */
export async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await RNFS.stat(filePath);
    return stats.size;
  } catch (error) {
    console.error('Error getting file size:', error);
    return 0;
  }
}

/**
 * Checks if image is too large and suggests compression
 * @param filePath - Path to the image file
 * @param maxSizeKB - Maximum size in KB, defaults to 2MB
 * @returns Object with size info and compression suggestion
 */
export async function checkImageSize(
  filePath: string,
  maxSizeKB: number = 2048
): Promise<{
  sizeKB: number;
  needsCompression: boolean;
  message: string;
}> {
  const sizeBytes = await getFileSize(filePath);
  const sizeKB = Math.round(sizeBytes / 1024);
  const needsCompression = sizeKB > maxSizeKB;
  
  let message = `Image size: ${sizeKB}KB`;
  if (needsCompression) {
    message += ` (exceeds ${maxSizeKB}KB limit, consider compressing)`;
  }
  
  return {
    sizeKB,
    needsCompression,
    message
  };
}

/**
 * Validates that a file path points to a valid image
 * @param filePath - Path to validate
 * @returns Boolean indicating if the file is a valid image
 */
export function isValidImagePath(filePath: string): boolean {
  if (!filePath) return false;
  
  const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  const extension = filePath.split('.').pop()?.toLowerCase();
  
  return validExtensions.includes(extension || '');
}

/**
 * Formats file path for the current platform
 * @param filePath - Raw file path
 * @returns Platform-appropriate file path
 */
export function formatFilePath(filePath: string): string {
  console.log('[IMAGE UTILS] formatFilePath input:', filePath);
  console.log('[IMAGE UTILS] Platform.OS:', Platform.OS);
  
  if (Platform.OS === 'android') {
    // Android file paths might need 'file://' prefix
    const result = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
    console.log('[IMAGE UTILS] Android formatted path:', result);
    return result;
  } else {
    // iOS paths are usually already properly formatted
    // For iOS simulator, we want to remove the 'file://' prefix if it exists
    const result = filePath.startsWith('file://') ? filePath.replace('file://', '') : filePath;
    console.log('[IMAGE UTILS] iOS formatted path:', result);
    return result;
  }
} 