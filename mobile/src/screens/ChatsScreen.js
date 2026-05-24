import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";

import { styles } from "../styles/styles";
import { HeaderBlock } from "../components/HeaderBlock";
import { UserAvatar } from "../components/UserAvatar";
import { getThreadBadge } from "../data/threads";

export function ChatsScreen({ threads, onOpenThread, onToggleMute }) {
  const unreadCount = threads.reduce((total, thread) => total + (thread.unread || 0), 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <HeaderBlock
        eyebrow="CHATS"
        title="Messages"
        subtitle={`${threads.length} threads · ${unreadCount} unread`}
      />

      <View style={localStyles.threadList}>
        {threads.length ? (
          threads.map((thread) => (
            <TouchableOpacity
              key={thread.id}
              style={localStyles.threadRow}
              onPress={() => onOpenThread(thread)}
              activeOpacity={0.84}
            >
              <ThreadAvatar thread={thread} />

              <View style={localStyles.threadMain}>
                <View style={localStyles.threadTop}>
                  <Text style={localStyles.threadName} numberOfLines={1}>
                    {thread.name}
                  </Text>
                  <Text style={localStyles.threadTime}>{thread.lastTime}</Text>

                  <TouchableOpacity
                    style={[localStyles.threadMuteButton, thread.muted && localStyles.threadMuteButtonActive]}
                    onPressIn={() => onToggleMute?.(thread.id, !thread.muted)}
                    activeOpacity={0.84}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={[localStyles.threadMuteText, thread.muted && localStyles.threadMuteTextActive]}>
                      {thread.muted ? "🔕" : "🔔"}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={localStyles.metaRow}>
                  <Text style={localStyles.typePill}>{formatThreadType(thread.type)}</Text>
                  <Text style={localStyles.threadSubtitle} numberOfLines={1}>
                    {thread.subtitle}
                  </Text>
                </View>

                <Text style={localStyles.threadPreview} numberOfLines={1}>
                  {thread.lastMessage || "No messages yet"}
                </Text>
              </View>

              {thread.unread > 0 ? (
                <View style={localStyles.unreadBadge}>
                  <Text style={localStyles.unreadText}>{thread.unread}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No chats yet</Text>
            <Text style={styles.emptyText}>
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
    const otherMember = thread.members.find((member) => member.name !== thread.name) || thread.members[0];
    return <UserAvatar user={otherMember} name={thread.name} size={50} />;
  }

  return (
    <View style={localStyles.avatar}>
      <Text style={localStyles.avatarText}>{getThreadBadge(thread.type)}</Text>
    </View>
  );
}

function formatThreadType(type) {
  const labels = {
    company: "Company",
    store: "Store",
    area: "Area",
    group: "Group",
    direct: "Direct",
  };

  return labels[type] || "Group";
}

const localStyles = StyleSheet.create({
  threadList: {
    gap: 12,
    paddingBottom: 96,
  },
  threadRow: {
    backgroundColor: "#101d2d",
    borderRadius: 26,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 19,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
  },
  threadMain: {
    flex: 1,
  },
  threadTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 5,
  },
  threadName: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    flex: 1,
    letterSpacing: -0.3,
  },
  threadTime: {
    color: "#8fa1b6",
    fontSize: 11,
    fontWeight: "800",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 5,
  },
  typePill: {
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#dbe7f3",
    fontSize: 10,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
    textTransform: "uppercase",
  },
  threadSubtitle: {
    color: "#9cadbf",
    fontSize: 11,
    fontWeight: "800",
    flex: 1,
  },
  threadPreview: {
    color: "#c2cfde",
    fontSize: 13,
    fontWeight: "700",
  },
  unreadBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  unreadText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },
  mutedPill: {
    color: "#8fa1b6",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  threadMuteButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  threadMuteButtonActive: {
    backgroundColor: "rgba(16,33,43,0.92)",
  },
  threadMuteText: {
    fontSize: 17,
  },
  threadMuteTextActive: {
    fontSize: 17,
  },
});
