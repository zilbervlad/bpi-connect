import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

export default function App() {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      <View style={styles.container}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>BPI</Text>
        </View>

        <Text style={styles.title}>BPI Connect</Text>
        <Text style={styles.subtitle}>
          The communication hub for Boston Pie teams.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Stay connected.</Text>
          <Text style={styles.cardText}>
            Messages, announcements, acknowledgements, and store updates in one place.
          </Text>

          <TouchableOpacity style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>View Demo Inbox</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Boston Pie, Inc.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#07111f",
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -1,
  },
  title: {
    color: "#ffffff",
    fontSize: 44,
    fontWeight: "900",
    letterSpacing: -2,
    marginBottom: 10,
  },
  subtitle: {
    color: "#b9c7d8",
    fontSize: 17,
    lineHeight: 25,
    marginBottom: 34,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 24,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
  },
  cardTitle: {
    color: "#10212b",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -1,
    marginBottom: 8,
  },
  cardText: {
    color: "#526273",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 22,
  },
  primaryButton: {
    backgroundColor: "#e91f3f",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  secondaryButton: {
    backgroundColor: "#eef5f8",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#163847",
    fontSize: 16,
    fontWeight: "900",
  },
  footer: {
    color: "#718399",
    textAlign: "center",
    marginTop: 28,
    fontWeight: "700",
  },
});
