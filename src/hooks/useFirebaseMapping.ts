import { useEffect, useState } from 'react';
import { useFirebase } from '../context/FirebaseContext';
import { getMappingPreset, saveMappingPreset, ColumnMapping } from '../services/firestoreService';

interface UseMappingResult {
  mapping: ColumnMapping | null;
  loading: boolean;
  error: string | null;
  saveMapping: (fileId: string, mapping: ColumnMapping) => Promise<void>;
  getMapping: (fileId: string) => Promise<void>;
}

/**
 * Hook để manage Firestore mapping presets
 * Auto-save mapping config và lấy mapping cũ cho auto-fill
 */
export const useFirebaseMapping = (fileId?: string): UseMappingResult => {
  const { user } = useFirebase();
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lấy mapping khi component mount hoặc fileId thay đổi
  useEffect(() => {
    if (user && fileId) {
      getMapping(fileId);
    }
  }, [user, fileId]);

  const getMapping = async (id: string) => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);
      const result = await getMappingPreset(user.uid, id);
      setMapping(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get mapping';
      setError(errorMessage);
      console.error('Error getting mapping:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveMapping = async (id: string, newMapping: ColumnMapping) => {
    if (!user) {
      setError('User not authenticated');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await saveMappingPreset(user.uid, id, newMapping);
      setMapping(newMapping);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save mapping';
      setError(errorMessage);
      console.error('Error saving mapping:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    mapping,
    loading,
    error,
    saveMapping,
    getMapping,
  };
};
