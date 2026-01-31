import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      try {
        const token = await SecureStore.getItemAsync("token");
        if (token) {
          router.replace("/(tabs)");
        } else {
          router.replace("/login");
        }
      } catch {
        router.replace("/login");
      }
    }
    checkAuth();
  }, [router]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Platform</Text>
      <ActivityIndicator size="large" color="#4f46e5" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#4f46e5",
    marginBottom: 24,
  },
});
