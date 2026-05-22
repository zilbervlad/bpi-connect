import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { styles } from "../styles/styles";
import { MessageCard } from "../components/MessageCard";

export function HomeScreen({ user, unreadCount, ackCount, messages, onOpenMessage, onGoInbox }) {
  const topMessages = messages.slice(0, 2);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <View style={styles.homeHero}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>BPI</Text>
        </View>

        <Text style={styles.homeEyebrow}>BPI CONNECT</Text>
        <Text style={styles.homeTitle}>Good afternoon, {user.name}.</Text>
        <Text style={styles.homeSubtitle}>
          The communication hub for Boston Pie teams.
        </Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{unreadCount}</Text>
          <Text style={styles.statLabel}>Unread</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{ackCount}</Text>
          <Text style={styles.statLabel}>Need Ack</Text>
        </View>
      </View>

      <View style={styles.quickCard}>
        <Text style={styles.sectionTitle}>Quick actions</Text>

        <TouchableOpacity style={styles.primaryButton} onPress={onGoInbox}>
          <Text style={styles.primaryButtonText}>Open Inbox</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>New Broadcast Coming Soon</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Latest updates</Text>
      </View>

      {topMessages.map((message) => (
        <MessageCard key={message.id} message={message} onPress={() => onOpenMessage(message)} />
      ))}
    </ScrollView>
  );
}
