import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';

interface PreviewData {
  id: string;
  tenantId: string;
  token: string;
  expiresAt: string;
  config: any;
}

export default function PreviewScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[DeepLink] Preview screen opened with token:', token);
    loadPreview();
  }, [token]);

  const loadPreview = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<{ preview: PreviewData }>(`/api/preview/${token}`);
      setPreview(data.preview);
      console.log('[Preview] Loaded preview data:', JSON.stringify(data.preview, null, 2));
    } catch (err: any) {
      setError(err.message || 'Failed to load preview');
      console.error('[Preview] Error loading preview:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4f46e5" />
        <Text style={styles.loadingText}>Loading preview...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#ef4444" />
        <Text style={styles.errorTitle}>Preview Not Found</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="eye-outline" size={48} color="#4f46e5" />
        <Text style={styles.title}>Live Preview</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Preview Token</Text>
        <Text style={styles.value} numberOfLines={1}>{token}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Expires At</Text>
        <Text style={styles.value}>
          {preview?.expiresAt ? new Date(preview.expiresAt).toLocaleString() : 'N/A'}
        </Text>
      </View>

      {preview?.config && (
        <View style={styles.card}>
          <Text style={styles.label}>Configuration</Text>
          <Text style={styles.codeBlock}>
            {JSON.stringify(preview.config, null, 2)}
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.button} onPress={() => router.back()}>
        <Text style={styles.buttonText}>Close Preview</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f9fafb',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 12,
  },
  loadingText: {
    marginTop: 12,
    color: '#6b7280',
    fontSize: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
  },
  errorText: {
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  label: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1f2937',
  },
  codeBlock: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#374151',
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
