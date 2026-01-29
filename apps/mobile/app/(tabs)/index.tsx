import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:5000";

interface DashboardStats {
  users: number;
  apiKeys: number;
  modules: number;
  connectors: number;
}

export default function DashboardScreen() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const token = await SecureStore.getItemAsync("token");
        const tenantId = await SecureStore.getItemAsync("tenantId");

        const res = await fetch(`${API_URL}/api/dashboard/stats`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "x-tenant-id": tenantId || "",
          },
        });

        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      <View style={styles.grid}>
        <View style={styles.card}>
          <Text style={styles.cardValue}>{stats?.users || 0}</Text>
          <Text style={styles.cardLabel}>Team Members</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardValue}>{stats?.apiKeys || 0}</Text>
          <Text style={styles.cardLabel}>API Keys</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardValue}>{stats?.modules || 0}</Text>
          <Text style={styles.cardLabel}>Active Modules</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardValue}>{stats?.connectors || 0}</Text>
          <Text style={styles.cardLabel}>Connectors</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb", padding: 16 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 16, color: "#1f2937" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardValue: { fontSize: 32, fontWeight: "bold", color: "#4f46e5" },
  cardLabel: { fontSize: 14, color: "#6b7280", marginTop: 4 },
});
