import { SafeAreaView, View, Text, TouchableOpacity, ScrollView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { styles, getPriorityStyle } from "../styles/styles";

export function MessageScreen({ message, onBack, onAcknowledge }) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      <View style={styles.appHeader}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>

        <View>
          <Text style={styles.headerTitle}>Announcement</Text>
          <Text style={styles.headerSubtitle}>{message.from}</Text>
        </View>
      </View>

      <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
        <View style={styles.detailCard}>
          <View style={[styles.priorityPill, getPriorityStyle(message.priority)]}>
            <Text style={styles.priorityText}>{message.priority}</Text>
          </View>

          <Text style={styles.detailTitle}>{message.title}</Text>
          <Text style={styles.detailMeta}>
            From {message.from} · {message.time}
          </Text>

          <Text style={styles.detailBody}>{message.body}</Text>

          {message.requiresAck && !message.acknowledged && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => onAcknowledge(message.id)}
            >
              <Text style={styles.primaryButtonText}>Acknowledge Message</Text>
            </TouchableOpacity>
          )}

          {message.requiresAck && message.acknowledged && (
            <View style={styles.acknowledgedBox}>
              <Text style={styles.acknowledgedBoxTitle}>Acknowledged</Text>
              <Text style={styles.acknowledgedBoxText}>
                You confirmed that you read this message.
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.secondaryButton} onPress={onBack}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
