import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";

import { styles } from "../styles/styles";
import { HeaderBlock } from "../components/HeaderBlock";
import { canSendBroadcast } from "../data/recipientGroups";

export function OpsScreen({
  user,
  onOpenAvailability,
  onOpenSchedule,
  onOpenTasks,
  onOpenRewards,
  onOpenSend,
}) {
  const canBroadcast = canSendBroadcast(user);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={localStyles.content}
    >
      <HeaderBlock
        eyebrow="OPS"
        title="Operations"
        subtitle="Your store tools, requests, and operational workflows"
      />

      <View style={localStyles.heroCard}>
        <Text style={localStyles.heroEyebrow}>OPERATIONS HUB</Text>
        <Text style={localStyles.heroTitle}>
          Everything your team needs to run the store.
        </Text>
        <Text style={localStyles.heroText}>
          Availability, schedules, tasks, recognition, and more will live here.
        </Text>
      </View>

      <View style={localStyles.grid}>
        <OpsTile
          icon="◷"
          title="Availability & Time Off"
          subtitle="Submit and review requests"
          onPress={onOpenAvailability}
          active
        />

        <OpsTile
          icon="▦"
          title="Schedule"
          subtitle="View schedules and updates"
          onPress={onOpenSchedule}
        />

        <OpsTile
          icon="✓"
          title="Store Tasks"
          subtitle="Assignments and follow-up"
          onPress={onOpenTasks}
        />

        <OpsTile
          icon="★"
          title="Recognition"
          subtitle="Rewards and team wins"
          onPress={onOpenRewards}
        />

        {canBroadcast ? (
          <OpsTile
            icon="➤"
            title="Send Update"
            subtitle="Message stores or groups"
            onPress={onOpenSend}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

function OpsTile({ icon, title, subtitle, onPress, active }) {
  return (
    <TouchableOpacity
      style={[
        localStyles.tile,
        active && localStyles.tileActive,
      ]}
      onPress={onPress}
      activeOpacity={0.86}
    >
      <View
        style={[
          localStyles.iconBox,
          active && localStyles.iconBoxActive,
        ]}
      >
        <Text
          style={[
            localStyles.iconText,
            active && localStyles.iconTextActive,
          ]}
        >
          {icon}
        </Text>
      </View>

      <View style={localStyles.tileMain}>
        <Text style={localStyles.tileTitle}>{title}</Text>
        <Text style={localStyles.tileSubtitle}>{subtitle}</Text>
      </View>

      <Text style={localStyles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const localStyles = StyleSheet.create({
  content: {
    padding: 12,
    paddingBottom: 110,
  },
  heroCard: {
    backgroundColor: "#101d2d",
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  heroEyebrow: {
    color: "#e91f3f",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
    marginBottom: 7,
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  heroText: {
    color: "#9cadbf",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    marginTop: 8,
  },
  grid: {
    gap: 9,
  },
  tile: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5ebf1",
  },
  tileActive: {
    borderColor: "#f3a0af",
    backgroundColor: "#fff8f9",
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "#edf2f6",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBoxActive: {
    backgroundColor: "#e91f3f",
  },
  iconText: {
    color: "#10212b",
    fontSize: 21,
    fontWeight: "900",
  },
  iconTextActive: {
    color: "#ffffff",
  },
  tileMain: {
    flex: 1,
    marginLeft: 12,
  },
  tileTitle: {
    color: "#10212b",
    fontSize: 16,
    fontWeight: "900",
  },
  tileSubtitle: {
    color: "#697b8d",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  chevron: {
    color: "#91a0af",
    fontSize: 23,
    fontWeight: "700",
  },
});
