import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Switch,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../src/auth';
import { notifications } from '../../src/notifications';
import { config, ENV } from '../../src/config';

interface User {
  id: string;
  email: string;
  name: string;
}

export default function SettingsScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const userData = await auth.getUser();
    setUser(userData);
    
    const token = await auth.getPushToken();
    setPushToken(token);
    setNotificationsEnabled(!!token);
  };

  const toggleNotifications = async (enabled: boolean) => {
    setLoading(true);
    try {
      if (enabled) {
        const token = await notifications.registerForPushNotifications();
        if (token) {
          setPushToken(token);
          setNotificationsEnabled(true);
          Alert.alert('Success', 'Push notifications enabled');
        } else {
          Alert.alert('Error', 'Failed to enable notifications. Please check permissions.');
        }
      } else {
        await auth.setPushToken('');
        setPushToken(null);
        setNotificationsEnabled(false);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const sendTestNotification = async () => {
    setSendingTest(true);
    try {
      const response = await notifications.sendTestNotification();
      console.log('[Notifications] Test sent:', JSON.stringify(response));
      Alert.alert('Success', 'Test notification sent!');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send test notification');
    } finally {
      setSendingTest(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await auth.logout();
          router.replace('/login');
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="person-outline" size={20} color="#6b7280" />
            <View style={styles.rowContent}>
              <Text style={styles.label}>Name</Text>
              <Text style={styles.value}>{user?.name || '-'}</Text>
            </View>
          </View>
        </View>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="mail-outline" size={20} color="#6b7280" />
            <View style={styles.rowContent}>
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{user?.email || '-'}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="notifications-outline" size={20} color="#6b7280" />
            <View style={styles.rowContent}>
              <Text style={styles.label}>Push Notifications</Text>
              <Text style={styles.sublabel}>
                {notificationsEnabled ? 'Enabled' : 'Disabled'}
              </Text>
            </View>
            {loading ? (
              <ActivityIndicator size="small" color="#4f46e5" />
            ) : (
              <Switch
                value={notificationsEnabled}
                onValueChange={toggleNotifications}
                trackColor={{ false: '#d1d5db', true: '#a5b4fc' }}
                thumbColor={notificationsEnabled ? '#4f46e5' : '#f4f3f4'}
              />
            )}
          </View>
        </View>
        
        {pushToken && (
          <View style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="key-outline" size={20} color="#6b7280" />
              <View style={styles.rowContent}>
                <Text style={styles.label}>Push Token</Text>
                <Text style={styles.tokenText} numberOfLines={1}>
                  {pushToken.substring(0, 30)}...
                </Text>
              </View>
            </View>
          </View>
        )}

        {notificationsEnabled && (
          <TouchableOpacity
            style={[styles.testButton, sendingTest && styles.buttonDisabled]}
            onPress={sendTestNotification}
            disabled={sendingTest}
          >
            {sendingTest ? (
              <ActivityIndicator color="#4f46e5" />
            ) : (
              <>
                <Ionicons name="send-outline" size={18} color="#4f46e5" />
                <Text style={styles.testButtonText}>Send Test Notification</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Environment</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="globe-outline" size={20} color="#6b7280" />
            <View style={styles.rowContent}>
              <Text style={styles.label}>Environment</Text>
              <Text style={styles.value}>{ENV.toUpperCase()}</Text>
            </View>
          </View>
        </View>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="server-outline" size={20} color="#6b7280" />
            <View style={styles.rowContent}>
              <Text style={styles.label}>API URL</Text>
              <Text style={styles.urlText} numberOfLines={1}>
                {config.API_URL}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#fff" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      <View style={styles.version}>
        <Text style={styles.versionText}>Platform Factory v1.0.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    color: '#1f2937',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowContent: {
    flex: 1,
    marginLeft: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1f2937',
  },
  sublabel: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  value: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  tokenText: {
    fontSize: 12,
    color: '#9ca3af',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  urlText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  testButtonText: {
    color: '#4f46e5',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  version: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 32,
  },
  versionText: {
    color: '#9ca3af',
    fontSize: 12,
  },
});
