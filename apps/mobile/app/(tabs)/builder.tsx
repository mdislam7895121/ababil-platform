import { View, Text, StyleSheet, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function BuilderScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Ionicons name="construct-outline" size={64} color="#4f46e5" />
        <Text style={styles.title}>Builder</Text>
        <Text style={styles.description}>
          The Builder feature allows you to configure your platform using natural language prompts.
        </Text>
        <Text style={styles.note}>
          For the best experience, use the web dashboard to access the full Builder functionality.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    padding: 20,
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 16,
  },
  note: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    fontStyle: "italic",
  },
});
