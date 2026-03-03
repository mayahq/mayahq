// Wrapper for react-native-fs to handle Expo Go
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';

const isExpoGo = Constants.appOwnership === 'expo';

let RNFS: any = null;

if (!isExpoGo) {
  // Only import if not in Expo Go
  try {
    RNFS = require('react-native-fs');
  } catch (e) {
    console.warn('react-native-fs not available');
  }
}

// Create a compatibility layer for Expo Go using expo-file-system
if (!RNFS) {
  RNFS = {
    DocumentDirectoryPath: FileSystem.documentDirectory,
    CachesDirectoryPath: FileSystem.cacheDirectory,
    
    exists: async (filepath: string): Promise<boolean> => {
      try {
        const info = await FileSystem.getInfoAsync(filepath);
        return info.exists;
      } catch {
        return false;
      }
    },
    
    stat: async (filepath: string) => {
      const info = await FileSystem.getInfoAsync(filepath);
      return {
        size: info.size || 0,
        isFile: () => !info.isDirectory,
        isDirectory: () => info.isDirectory || false,
        mtime: info.modificationTime ? new Date(info.modificationTime * 1000) : new Date(),
        ctime: info.modificationTime ? new Date(info.modificationTime * 1000) : new Date(),
      };
    },
    
    readFile: async (filepath: string, encoding: string = 'utf8'): Promise<string> => {
      if (encoding === 'base64') {
        return await FileSystem.readAsStringAsync(filepath, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      return await FileSystem.readAsStringAsync(filepath, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    },
    
    writeFile: async (filepath: string, contents: string, encoding: string = 'utf8'): Promise<void> => {
      const options = encoding === 'base64' 
        ? { encoding: FileSystem.EncodingType.Base64 }
        : { encoding: FileSystem.EncodingType.UTF8 };
      await FileSystem.writeAsStringAsync(filepath, contents, options);
    },
    
    unlink: async (filepath: string): Promise<void> => {
      await FileSystem.deleteAsync(filepath, { idempotent: true });
    },
    
    mkdir: async (filepath: string): Promise<void> => {
      await FileSystem.makeDirectoryAsync(filepath, { intermediates: true });
    },
    
    readDir: async (dirpath: string) => {
      const files = await FileSystem.readDirectoryAsync(dirpath);
      return files.map(name => ({
        name,
        path: `${dirpath}/${name}`,
        isFile: () => true, // We can't determine this without additional calls
        isDirectory: () => false,
      }));
    },
    
    copyFile: async (sourcePath: string, destPath: string): Promise<void> => {
      await FileSystem.copyAsync({ from: sourcePath, to: destPath });
    },
    
    moveFile: async (sourcePath: string, destPath: string): Promise<void> => {
      await FileSystem.moveAsync({ from: sourcePath, to: destPath });
    },
  };
}

export default RNFS;