import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';

interface InviteData {
  id: string;
  tenantName: string;
  role: string;
  expiresAt: string;
}

export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[DeepLink] Invite screen opened with token:', token);
    loadInvite();
  }, [token]);

  const loadInvite = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<{ invite: InviteData }>(`/api/invites/${token}`);
      setInvite(data.invite);
    } catch (err: any) {
      setError(err.message || 'Failed to load invite');
    } finally {
      setLoading(false);
    }
  };

  const acceptInvite = async () => {
    try {
      setAccepting(true);
      await api.post(`/api/invites/${token}/accept`, {});
      Alert.alert('Success', 'Invite accepted! You are now a member.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to accept invite');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4f46e5" />
        <Text style={styles.loadingText}>Loading invite...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#ef4444" />
        <Text style={styles.errorTitle}>Invalid Invite</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="mail-outline" size={64} color="#4f46e5" />
        <Text style={styles.title}>You're Invited!</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Workspace</Text>
        <Text style={styles.value}>{invite?.tenantName || 'Unknown'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Role</Text>
        <Text style={styles.value}>{invite?.role || 'Member'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Expires</Text>
        <Text style={styles.value}>
          {invite?.expiresAt ? new Date(invite.expiresAt).toLocaleString() : 'N/A'}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.button, styles.acceptButton]}
        onPress={acceptInvite}
        disabled={accepting}
      >
        {accepting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Accept Invite</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.declineButton]}
        onPress={() => router.back()}
      >
        <Text style={[styles.buttonText, styles.declineText]}>Decline</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
    padding: 24,
    justifyContent: 'center',
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
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
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
  },
  value: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 4,
  },
  button: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  acceptButton: {
    backgroundColor: '#4f46e5',
  },
  declineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  declineText: {
    color: '#6b7280',
  },
});
