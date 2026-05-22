import { useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";

const demoMessages = [
  {
    id: 1,
    priority: "HIGH",
    title: "Weekend Load & Go Focus",
    from: "Operations Team",
    time: "Today · 9:15 AM",
    body: "All stores should have a certified Load Captain assigned for every rush. Focus on clean oven flow, clear dispatch, and keeping load time under control.",
    requiresAck: true,
    unread: true,
  },
  {
    id: 2,
    priority: "ACK",
    title: "Image Standards Reminder",
    from: "Training Team",
    time: "Yesterday · 4:42 PM",
    body: "Managers, please review image standards with your team before Friday night. Uniforms, hats, aprons, and clean presentation matter.",
    requiresAck: true,
    unread: true,
  },
  {
    id: 3,
    priority: "STORE",
    title: "Maintenance Follow-Up",
    from: "Facilities",
    time: "Yesterday · 1:20 PM",
    body: "Open maintenance items should be reviewed during the manager walk. Add notes if the issue is resolved or needs escalation.",
    requiresAck: false,
    unread: false,
  },
  {
    id: 4,
    priority: "TRAINING",
    title: "MIT Checklist Update",
    from: "Academy",
    time: "Mon · 10:05 AM",
    body: "The MIT development checklist is being cleaned up to better track Level I, II, and III progress.",
    requiresAck: false,
    unread: false,
  },
];

export default function App() {
  const [screen, setScreen] = useState("home");
  const [selectedMessage, setSelectedMessage] = useState(null);

  function openInbox() {
    setScreen("inbox");
    setSelectedMessage(null);
  }

  function openMessage(message) {
    setSelectedMessage(message);
    setScreen("message");
  }

  function goBack() {
    if (screen === "message") {
      setScreen("inbox");
      setSelectedMessage(null);
      return;
    }

    setScreen("home");
  }

  if (screen === "inbox") {
    return <InboxScreen onBack={goBack} onOpenMessage={openMessage} />;
  }

  if (screen === "message" && selectedMessage) {
    return <MessageScreen message={selectedMessage} onBack={goBack} />;
  }

  return <HomeScreen onOpenInbox={openInbox} />;
}

function HomeScreen({ onOpenInbox }) {
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

          <TouchableOpacity style={styles.secondaryButton} onPress={onOpenInbox}>
            <Text style={styles.secondaryButtonText}>View Demo Inbox</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Boston Pie, Inc.</Text>
      </View>
    </SafeAreaView>
  );
}

function InboxScreen({ onBack, onOpenMessage }) {
  const unreadCount = demoMessages.filter((message) => message.unread).length;
  const ackCount = demoMessages.filter((message) => message.requiresAck).length;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      <View style={styles.appHeader}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>

        <View>
          <Text style={styles.headerTitle}>Inbox</Text>
          <Text style={styles.headerSubtitle}>
            {unreadCount} unread · {ackCount} need acknowledgement
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.inboxHero}>
          <Text style={styles.inboxHeroEyebrow}>BPI CONNECT</Text>
          <Text style={styles.inboxHeroTitle}>Today’s messages</Text>
          <Text style={styles.inboxHeroText}>
            Company updates, store follow-ups, and required acknowledgements.
          </Text>
        </View>

        {demoMessages.map((message) => (
          <TouchableOpacity
            key={message.id}
            style={[styles.messageCard, message.unread && styles.messageCardUnread]}
            onPress={() => onOpenMessage(message)}
          >
            <View style={styles.messageTopRow}>
              <View style={styles.messageMetaLeft}>
                <Text style={styles.messageFrom}>{message.from}</Text>
                <Text style={styles.messageTime}>{message.time}</Text>
              </View>

              <View style={[styles.priorityPill, getPriorityStyle(message.priority)]}>
                <Text style={styles.priorityText}>{message.priority}</Text>
              </View>
            </View>

            <Text style={styles.messageTitle}>{message.title}</Text>
            <Text style={styles.messagePreview} numberOfLines={2}>
              {message.body}
            </Text>

            <View style={styles.messageFooterRow}>
              {message.requiresAck ? (
                <Text style={styles.ackText}>Requires acknowledgement</Text>
              ) : (
                <Text style={styles.normalText}>No acknowledgement needed</Text>
              )}

              {message.unread && <View style={styles.unreadDot} />}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function MessageScreen({ message, onBack }) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      <View style={styles.appHeader}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>

        <View>
          <Text style={styles.headerTitle}>Message</Text>
          <Text style={styles.headerSubtitle}>{message.from}</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.detailCard}>
          <View style={[styles.priorityPill, getPriorityStyle(message.priority)]}>
            <Text style={styles.priorityText}>{message.priority}</Text>
          </View>

          <Text style={styles.detailTitle}>{message.title}</Text>
          <Text style={styles.detailMeta}>
            From {message.from} · {message.time}
          </Text>

          <Text style={styles.detailBody}>{message.body}</Text>

          {message.requiresAck && (
            <TouchableOpacity style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Acknowledge Message</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.secondaryButton} onPress={onBack}>
            <Text style={styles.secondaryButtonText}>Back to Inbox</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function getPriorityStyle(priority) {
  if (priority === "HIGH") return styles.priorityHigh;
  if (priority === "ACK") return styles.priorityAck;
  if (priority === "STORE") return styles.priorityStore;
  return styles.priorityTraining;
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
    marginTop: 12,
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
    marginTop: 12,
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
  appHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    color: "#ffffff",
    fontSize: 36,
    lineHeight: 38,
    fontWeight: "600",
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -1,
  },
  headerSubtitle: {
    color: "#9cadbf",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 36,
  },
  inboxHero: {
    backgroundColor: "#ffffff",
    borderRadius: 26,
    padding: 22,
    marginBottom: 16,
  },
  inboxHeroEyebrow: {
    color: "#e91f3f",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  inboxHeroTitle: {
    color: "#10212b",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1.2,
    marginBottom: 6,
  },
  inboxHeroText: {
    color: "#526273",
    fontSize: 15,
    lineHeight: 22,
  },
  messageCard: {
    backgroundColor: "#101d2d",
    borderRadius: 22,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  messageCardUnread: {
    borderColor: "rgba(233,31,63,0.55)",
    backgroundColor: "#132236",
  },
  messageTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 14,
  },
  messageMetaLeft: {
    flex: 1,
  },
  messageFrom: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  messageTime: {
    color: "#8597aa",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  messageTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.6,
    marginBottom: 6,
  },
  messagePreview: {
    color: "#b8c6d6",
    fontSize: 14,
    lineHeight: 21,
  },
  messageFooterRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ackText: {
    color: "#ffb3c0",
    fontSize: 12,
    fontWeight: "900",
  },
  normalText: {
    color: "#8092a6",
    fontSize: 12,
    fontWeight: "800",
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 10,
    backgroundColor: "#e91f3f",
  },
  priorityPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  priorityText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  priorityHigh: {
    backgroundColor: "#e91f3f",
  },
  priorityAck: {
    backgroundColor: "#f59e0b",
  },
  priorityStore: {
    backgroundColor: "#0089a7",
  },
  priorityTraining: {
    backgroundColor: "#24556b",
  },
  detailCard: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 24,
  },
  detailTitle: {
    color: "#10212b",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1.2,
    marginTop: 18,
    marginBottom: 8,
  },
  detailMeta: {
    color: "#697b8d",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 22,
  },
  detailBody: {
    color: "#263847",
    fontSize: 17,
    lineHeight: 27,
    marginBottom: 18,
  },
});
