import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { styles } from "../styles/styles";

export function HomeScreen({
  user,
  unreadCount,
  ackCount,
  messages,
  threads = [],
  onOpenInbox,
  onOpenChats,
  onOpenThread,
  onOpenPeople,
  onOpenSend,
  onOpenAdmin,
}) {
  const recentThreads = threads.slice(0, 4);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={localStyles.content}>
      <View style={localStyles.header}>
        <View style={localStyles.headerTop}>
          <View>
            <Text style={localStyles.eyebrow}>BPI CONNECT</Text>
            <Text style={localStyles.greeting}>{getGreeting()}, {firstName(user.name)}</Text>
          </View>

          <View style={localStyles.avatar}>
            <Text style={localStyles.avatarText}>{user.name.charAt(0)}</Text>
          </View>
        </View>

        <Text style={localStyles.subtitle}>
          {formatRole(user.role)} · {user.store || user.area || "Company"}
        </Text>

        <View style={localStyles.headerDivider} />

        <View style={localStyles.headerFooter}>
          <View>
            <Text style={localStyles.footerNumber}>{unreadCount}</Text>
            <Text style={localStyles.footerLabel}>Unread</Text>
          </View>

          <View style={localStyles.footerDivider} />

          <View>
            <Text style={localStyles.footerNumber}>{ackCount}</Text>
            <Text style={localStyles.footerLabel}>Needs Response</Text>
          </View>
        </View>
      </View>

      <View style={localStyles.sectionHeader}>
        <View>
          <Text style={localStyles.sectionTitle}>Recent Chats</Text>
          <Text style={localStyles.sectionSub}>Latest activity across your team</Text>
        </View>

        <TouchableOpacity onPress={onOpenChats} activeOpacity={0.8}>
          <Text style={localStyles.viewAll}>View all</Text>
        </TouchableOpacity>
      </View>

      <View style={localStyles.chatCard}>
        {recentThreads.length ? (
          recentThreads.map((thread, index) => (
            <TouchableOpacity
              key={thread.id}
              style={[
                localStyles.threadRow,
                index !== recentThreads.length - 1 && localStyles.threadBorder,
              ]}
              onPress={() => onOpenThread?.(thread.id)}
              activeOpacity={0.84}
            >
              <View style={localStyles.threadAvatar}>
                <Text style={localStyles.threadAvatarText}>{thread.name.charAt(0)}</Text>
              </View>

              <View style={localStyles.threadMain}>
                <View style={localStyles.threadTop}>
                  <Text style={localStyles.threadName} numberOfLines={1}>
                    {thread.name}
                  </Text>

                  {thread.unread ? (
                    <View style={localStyles.unreadBadge}>
                      <Text style={localStyles.unreadBadgeText}>{thread.unread}</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={localStyles.threadPreview} numberOfLines={1}>
                  {thread.lastMessage || thread.last_message || "No recent message"}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={localStyles.emptyChats}>
            <Text style={localStyles.emptyTitle}>No conversations yet</Text>
            <Text style={localStyles.emptyText}>
              Store threads, group updates, and direct messages will appear here.
            </Text>
          </View>
        )}
      </View>

    </ScrollView>
  );
}

function ActionTile({ title, subtitle, icon, onPress, accent }) {
  return (
    <TouchableOpacity
      style={[localStyles.actionTile, accent && localStyles.actionTileAccent]}
      onPress={onPress}
      activeOpacity={0.86}
    >
      <View style={[localStyles.actionIcon, accent && localStyles.actionIconAccent]}>
        <Text style={[localStyles.actionIconText, accent && localStyles.actionIconTextAccent]}>
          {icon}
        </Text>
      </View>

      <Text style={[localStyles.actionTitle, accent && localStyles.actionTitleAccent]}>
        {title}
      </Text>
      <Text style={[localStyles.actionSub, accent && localStyles.actionSubAccent]}>
        {subtitle}
      </Text>
    </TouchableOpacity>
  );
}

function firstName(name) {
  return (name || "there").split(" ")[0];
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatRole(role) {
  const labels = {
    admin: "Admin",
    hr: "HR",
    coach: "Coach",
    supervisor: "Supervisor",
    general_manager: "General Manager",
    manager: "Manager",
    tm: "TM",
    Admin: "Admin",
    HR: "HR",
    Coach: "Coach",
    Supervisor: "Supervisor",
    "General Manager": "General Manager",
    Manager: "Manager",
    TM: "TM",
  };

  return labels[role] || role || "Team";
}

const localStyles = StyleSheet.create({
  content: {
    padding: 14,
    paddingBottom: 118,
  },

  header: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  eyebrow: {
    color: "#e91f3f",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 4,
  },
  greeting: {
    color: "#10212b",
    fontSize: 19,
    lineHeight: 23,
    fontWeight: "900",
    letterSpacing: -0.6,
    maxWidth: 220,
  },
  subtitle: {
    color: "#617386",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    marginTop: 3,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  headerDivider: {
    height: 1,
    backgroundColor: "#e9eef3",
    marginVertical: 8,
  },
  headerFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  footerDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#e9eef3",
  },
  footerNumber: {
    color: "#10212b",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  footerLabel: {
    color: "#617386",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginTop: 0,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  sectionSub: {
    color: "#8fa1b6",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  viewAll: {
    color: "#e91f3f",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 6,
  },

  chatCard: {
    backgroundColor: "#101d2d",
    borderRadius: 22,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 8,
  },
  threadBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  threadAvatar: {
    width: 34,
    height: 34,
    borderRadius: 13,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  threadAvatarText: {
    color: "#10212b",
    fontSize: 14,
    fontWeight: "900",
  },
  threadMain: {
    flex: 1,
  },
  threadTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  threadName: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
    flex: 1,
  },
  threadPreview: {
    color: "#91a3b8",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },
  emptyChats: {
    padding: 18,
  },
  emptyTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  emptyText: {
    color: "#8fa1b6",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    marginTop: 4,
  },  actionTileAccent: {
    backgroundColor: "#e91f3f",
    borderColor: "#e91f3f",
  },  actionIconAccent: {
    backgroundColor: "#ffffff",
  },  actionIconTextAccent: {
    color: "#e91f3f",
  },  actionTitleAccent: {
    color: "#ffffff",
  },  actionSubAccent: {
    color: "#ffe2e8",
  },  focusMain: {
    flex: 1,
  },  focusText: {
    color: "#9cadbf",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    marginTop: 4,
  },
});
