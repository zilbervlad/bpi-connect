import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { styles } from "../styles/styles";
import { UserAvatar } from "../components/UserAvatar";

export function HomeScreen({
  user,
  unreadCount,
  ackCount,
  messages,
  threads = [],
  onOpenInbox,
  onOpenChats,
  onOpenThread,
  onOpenMessage,
  onOpenPeople,
  onOpenSend,
  onOpenAdmin,
}) {
  const announcementMessages = (messages || []).filter(
    (message) => message.type === "announcement"
  );

  const featuredAnnouncement =
    announcementMessages.find((message) => message.requiresAck && !message.acknowledged) ||
    announcementMessages.find((message) => message.unread) ||
    announcementMessages[0];
  const recentThreads = threads
    .filter((thread) => String(thread.name || "").toLowerCase() !== "company announcements")
    .slice(0, 4);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={localStyles.content}>
      <View style={localStyles.header}>
        <View style={localStyles.headerTop}>
          <View>
            <Text style={localStyles.eyebrow}>BPI CONNECT</Text>
            <Text style={localStyles.greeting}>{getGreeting()}, {firstName(user.name)}</Text>
          </View>

          <UserAvatar user={user} size={36} />
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

      {featuredAnnouncement ? (
        <>
          <View style={localStyles.sectionHeader}>
            <View>
              <Text style={localStyles.sectionTitle}>Latest Update</Text>
              <Text style={localStyles.sectionSub}>Company announcement</Text>
            </View>

            <TouchableOpacity onPress={onOpenInbox} activeOpacity={0.8}>
              <Text style={localStyles.viewAll}>View all</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              localStyles.featuredAnnouncementCard,
              featuredAnnouncement.requiresAck &&
                !featuredAnnouncement.acknowledged &&
                localStyles.featuredAnnouncementCardUrgent,
            ]}
            onPress={() => onOpenMessage?.(featuredAnnouncement)}
            activeOpacity={0.88}
          >
            <View style={localStyles.featuredAnnouncementTop}>
              <View style={localStyles.featuredAnnouncementIcon}>
                <Text style={localStyles.featuredAnnouncementIconText}>
                  {featuredAnnouncement.requiresAck && !featuredAnnouncement.acknowledged ? "!" : "i"}
                </Text>
              </View>

              <View style={localStyles.featuredAnnouncementTitleWrap}>
                <Text style={localStyles.featuredAnnouncementLabel}>
                  {featuredAnnouncement.requiresAck && !featuredAnnouncement.acknowledged
                    ? "NEEDS RESPONSE"
                    : "COMPANY UPDATE"}
                </Text>
                <Text style={localStyles.featuredAnnouncementTitle} numberOfLines={2}>
                  {featuredAnnouncement.title}
                </Text>
              </View>
            </View>

            <Text style={localStyles.featuredAnnouncementBody} numberOfLines={2}>
              {featuredAnnouncement.body}
            </Text>

            <View style={localStyles.featuredAnnouncementFooter}>
              <Text style={localStyles.featuredAnnouncementMeta} numberOfLines={1}>
                {featuredAnnouncement.from} · {featuredAnnouncement.time}
              </Text>

              <Text style={localStyles.featuredAnnouncementOpen}>Open</Text>
            </View>
          </TouchableOpacity>
        </>
      ) : null}

      <View style={localStyles.sectionHeader}>
        <View>
          <Text style={localStyles.sectionTitle}>Recent Chats</Text>
          <Text style={localStyles.sectionSub}>Latest team activity</Text>
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

function AnnouncementRow({ message, pinned, onPress }) {
  return (
    <TouchableOpacity
      style={localStyles.announcementRow}
      onPress={onPress}
      activeOpacity={0.86}
    >
      <View style={[localStyles.announcementIcon, pinned && localStyles.announcementIconPinned]}>
        <Text style={localStyles.announcementIconText}>{pinned ? "!" : "i"}</Text>
      </View>

      <View style={localStyles.announcementMain}>
        <View style={localStyles.announcementTop}>
          <Text style={localStyles.announcementTitle} numberOfLines={1}>
            {message.title}
          </Text>

          {pinned ? (
            <Text style={localStyles.pinnedPill}>PINNED</Text>
          ) : null}
        </View>

        <Text style={localStyles.announcementBody} numberOfLines={2}>
          {message.body}
        </Text>

        <Text style={localStyles.announcementMeta} numberOfLines={1}>
          {message.from} · {message.time}
        </Text>
      </View>
    </TouchableOpacity>
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
    padding: 12,
    paddingBottom: 118,
  },

  header: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  eyebrow: {
    color: "#e91f3f",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.8,
    marginBottom: 3,
  },
  greeting: {
    color: "#10212b",
    fontSize: 19,
    lineHeight: 22,
    fontWeight: "900",
    letterSpacing: -0.6,
    maxWidth: 250,
  },
  subtitle: {
    color: "#617386",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 11,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 13,
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
    gap: 10,
  },
  footerDivider: {
    width: 1,
    height: 16,
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
    letterSpacing: 0.5,
    marginTop: 0,
  },

  featuredAnnouncementCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.14)",
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: 4,
  },
  featuredAnnouncementCardUrgent: {
    borderColor: "rgba(245, 158, 11, 0.42)",
    backgroundColor: "#fffbeb",
  },
  featuredAnnouncementTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  featuredAnnouncementIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
  },
  featuredAnnouncementIconText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  featuredAnnouncementTitleWrap: {
    flex: 1,
  },
  featuredAnnouncementLabel: {
    color: "#e91f3f",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginBottom: 3,
  },
  featuredAnnouncementTitle: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 21,
    letterSpacing: -0.25,
  },
  featuredAnnouncementBody: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
    fontWeight: "600",
  },
  featuredAnnouncementFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  featuredAnnouncementMeta: {
    flex: 1,
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
  },
  featuredAnnouncementOpen: {
    color: "#e91f3f",
    fontSize: 12,
    fontWeight: "900",
    backgroundColor: "#fff1f4",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  announcementCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 8,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  announcementRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    marginBottom: 7,
  },
  announcementIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    backgroundColor: "#10212b",
    alignItems: "center",
    justifyContent: "center",
  },
  announcementIconPinned: {
    backgroundColor: "#e91f3f",
  },
  announcementIconText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  announcementMain: {
    flex: 1,
    minWidth: 0,
  },
  announcementTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 3,
  },
  announcementTitle: {
    flex: 1,
    color: "#10212b",
    fontSize: 14,
    fontWeight: "900",
  },
  announcementBody: {
    color: "#526273",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  announcementMeta: {
    color: "#91a1b2",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 5,
  },
  pinnedPill: {
    color: "#e91f3f",
    backgroundColor: "#ffe4e8",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    fontSize: 9,
    fontWeight: "900",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 22,
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
    borderRadius: 24,
    padding: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
  },
  threadBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  threadAvatar: {
    width: 40,
    height: 40,
    borderRadius: 15,
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
    fontSize: 16,
    fontWeight: "900",
    flex: 1,
  },
  threadPreview: {
    color: "#91a3b8",
    fontSize: 13,
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
