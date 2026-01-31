import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Switch, ActivityIndicator } from "react-native";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:5000";

interface Module {
  key: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
}

const MODULE_NAMES: Record<string, string> = {
  booking: "Booking",
  ecommerce: "E-commerce",
  crm: "CRM",
  support: "Support",
  analytics: "Analytics",
  ai_assistant: "AI Assistant",
};

export default function ModulesScreen() {
  const [modules, setModules] = useState<Module[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchModules();
  }, []);

  async function fetchModules() {
    try {
      const token = await SecureStore.getItemAsync("token");
      const tenantId = await SecureStore.getItemAsync("tenantId");

      const res = await fetch(`${API_URL}/api/modules`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId || "",
        },
      });

      if (res.ok) {
        const data = await res.json();
        setModules(data);
      }
    } catch (error) {
      console.error("Failed to fetch modules:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleModule(key: string, enabled: boolean) {
    try {
      const token = await SecureStore.getItemAsync("token");
      const tenantId = await SecureStore.getItemAsync("tenantId");

      const res = await fetch(`${API_URL}/api/modules/${key}/toggle`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled }),
      });

      if (res.ok) {
        setModules((prev) => prev.map((m) => (m.key === key ? { ...m, enabled } : m)));
      }
    } catch (error) {
      console.error("Failed to toggle module:", error);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Modules</Text>
      {modules.map((module) => (
        <View key={module.key} style={styles.card}>
          <View>
            <Text style={styles.cardTitle}>{MODULE_NAMES[module.key] || module.key}</Text>
            <Text style={styles.cardStatus}>{module.enabled ? "Active" : "Inactive"}</Text>
          </View>
          <Switch
            value={module.enabled}
            onValueChange={(enabled) => toggleModule(module.key, enabled)}
            trackColor={{ false: "#d1d5db", true: "#c7d2fe" }}
            thumbColor={module.enabled ? "#4f46e5" : "#f4f3f4"}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb", padding: 16 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 16, color: "#1f2937" },
  card: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#1f2937" },
  cardStatus: { fontSize: 14, color: "#6b7280", marginTop: 2 },
});
