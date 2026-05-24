import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";

import { styles } from "../styles/styles";
import { UserAvatar } from "../components/UserAvatar";
import { getThreadBadge } from "../data/threads";

export function ChatsScreen({ threads, onOpenThread, onToggleMute }) {
  const unreadCount = threads.reduce((total, thread) => total + (thread.unread || 0), 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <View style={localStyles.heroCard}>
        <Text style={localStyles.heroEyebrow}>CHATS</Text>
        <Text style={localStyles.heroTitle}>Messages</Text>
        <Text style={localStyles.heroSubtitle}>
          {threads.length} threads · {unreadCount} unread
        </Text>
      </View>

      <View style={localStyles.groupCard}>
        {threads.length ? (
          threads.map((thread, index) => (
            <View key={thread.id}>
              <View style={localStyles.threadRow}>
                <TouchableOpacity
                  style={localStyles.threadOpenArea}
                  onPress={() => onOpenThread(thread)}
                  activeOpacity={0.84}
                >
                  <ThreadAvatar thread={thread} />

                  <View style={localStyles.threadMain}>
                    <View style={localStyles.threadTop}>
                      <Text style={localStyles.threadName} numberOfLines={1}>
                        {thread.name}
                      </Text>

                      <Text style={localStyles.threadTime}>
                        {thread.lastTime}
                      </Text>
                    </View>

                    <View style={localStyles.previewRow}>
                      <Text style={localStyles.typePill}>
                        {formatThreadType(thread.type)}
                      </Text>

                      <Text style={localStyles.threadPreview} numberOfLines={1}>
                        {thread.lastMessage || thread.subtitle || "No messages yet"}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>

                <View style={localStyles.rightRail}>
                  {thread.unread > 0 ? (
                    <View style={localStyles.unreadBadge}>
                      <Text style={localStyles.unreadText}>{thread.unread}</Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={[
                      localStyles.threadMuteButton,
                      thread.muted && localStyles.threadMuteButtonActive,
                    ]}
                    onPressIn={() => onToggleMute?.(thread.id, !thread.muted)}
                    activeOpacity={0.84}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Text style={localStyles.threadMuteText}>
                      {thread.muted ? "🔕" : "🔔"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {index < threads.length - 1 ? <View style={localStyles.divider} /> : null}
            </View>
          ))
        ) : (
          <View style={localStyles.emptyState}>
            <Text style={localStyles.emptyTitle}>No chats yet</Text>
            <Text style={localStyles.emptyText}>
              Groups and direct messages will show here once you create them.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function ThreadAvatar({ thread }) {
  if (thread.type === "direct" && thread.members?.length) {
    const otherMember =
      thread.members.find((member) => member.id !== thread.currentUserId) ||
      thread.members[0];

    return <UserAvatar user={otherMember} name={thread.name} size={32} />;
  }

  return (
    <View style={localStyles.avatar}>
      <Text style={localStyles.avatarText}>{getThreadBadge(thread.type)}</Text>
    </View>
  );
}

function formatThreadType(type) {
  const map = {
    company: "Co",
    area: "Area",
    store: "Store",
    role: "Role",
    direct: "DM",
  };

  return map[type] || "Chat";
}

const localStyles = StyleSheet.create({
  heroCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  heroEyebrow: {
    color: "#ef1745",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 3,
    marginBottom: 6,
  },
  heroTitle: {
    color: "#10212b",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1.5,
  },
  heroSubtitle: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 4,
  },
  groupCard: {
    backgroundColor: "#101d2c",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#203044",
    overflow: "hidden",
  },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 48,
  },
  threadOpenArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ef1745",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },
  threadMain: {
    flex: 1,
    minWidth: 0,
  },
  threadTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  threadName: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
    flex: 1,
  },
  threadTime: {
    color: "#8fa1b6",
    fontSize: 10,
    fontWeight: "900",
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 1,
  },
  typePill: {
    color: "#ffffff",
    backgroundColor: "#26364a",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 5,
    paddingVertical: 1,
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  threadPreview: {
    color: "#9aacbf",
    fontSize: 11,
    fontWeight: "800",
    flex: 1,
  },
  rightRail: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    marginLeft: 4,
  },
  threadMuteButton: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  threadMuteButtonActive: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  threadMuteText: {
    fontSize: 11,
  },
  unreadBadge: {
    backgroundColor: "#ef1745",
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadText: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "900",
  },
  divider: {
    height: 1,
    backgroundColor: "#203044",
    marginLeft: 50,
  },
  emptyState: {
    padding: 14,
  },
  emptyTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  emptyText: {
    color: "#9aacbf",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 4,
  },
});
