import { useEffect, useState } from 'react';
import { useFirebase } from '../context/FirebaseContext';
import { getMappingPreset, saveMappingPreset, type ColumnMapping } from '../services/firestoreService';
import { logError } from '../utils/logger';

interface UseMappingResult {
  mapping: ColumnMapping | null;
  savedHeaderRowIndex: number | null;
  loading: boolean;
  error: string | null;
  saveMapping: (fileId: string, mapping: ColumnMapping, headerRowIndex: number) => Promise<void>;
  getMapping: (fileId: string) => Promise<void>;
}

/**
 * Hook để manage Firestore mapping presets
 * Auto-save mapping config và lấy mapping cũ cho auto-fill
 */
export const useFirebaseMapping = (fileId?: string): UseMappingResult => {
  const { user } = useFirebase();
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [savedHeaderRowIndex, setSavedHeaderRowIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(!!fileId);
  const [error, setError] = useState<string | null>(null);

  // Lấy mapping khi component mount hoặc fileId thay đổi
  useEffect(() => {
    if (user && fileId) {
      setLoading(true); // 🚨 Ensure loading is true before fetching
      getMapping(fileId);
    } else {
      // Reset states when dependencies missing or changing
      setMapping(null);
      setSavedHeaderRowIndex(null);
      setLoading(false);
    }
  }, [user, fileId]);

  const getMapping = async (id: string) => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);
      const result = await getMappingPreset(user.uid, id);
      if (result) {
        setMapping(result.mapping);
        if (result.headerRowIndex !== undefined) {
          setSavedHeaderRowIndex(result.headerRowIndex);
        }
      } else {
        setMapping(null);
        setSavedHeaderRowIndex(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get mapping';
      setError(errorMessage);
      logError('Error getting mapping:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveMapping = async (id: string, newMapping: ColumnMapping, headerRowIndex: number) => {
    if (!user) {
      setError('User not authenticated');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Sanitize mapping to remove undefined values
      const sanitizedMapping: any = { ...newMapping };
      Object.keys(sanitizedMapping).forEach(key => {
        if (sanitizedMapping[key] === undefined) {
          sanitizedMapping[key] = null;
        }
      });
      
      await saveMappingPreset(user.uid, id, sanitizedMapping, headerRowIndex);
      setMapping(sanitizedMapping);
      setSavedHeaderRowIndex(headerRowIndex);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save mapping';
      setError(errorMessage);
      logError('Error saving mapping:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    mapping,
    savedHeaderRowIndex,
    loading,
    error,
    saveMapping,
    getMapping,
  };
};
