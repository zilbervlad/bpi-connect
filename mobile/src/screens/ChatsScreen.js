import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";

import { styles } from "../styles/styles";
import { HeaderBlock } from "../components/HeaderBlock";
import { getThreadBadge } from "../data/threads";

export function ChatsScreen({ threads, onOpenThread }) {
  const unreadCount = threads.reduce((total, thread) => total + thread.unread, 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <HeaderBlock
        eyebrow="CHATS"
        title="Messages"
        subtitle={`${threads.length} threads · ${unreadCount} unread`}
      />

      <View style={localStyles.threadList}>
        {threads.map((thread) => (
          <TouchableOpacity
            key={thread.id}
            style={localStyles.threadRow}
            onPress={() => onOpenThread(thread)}
          >
            <View style={localStyles.avatar}>
              <Text style={localStyles.avatarText}>
                {thread.type === "direct" ? thread.name.charAt(0) : getThreadBadge(thread.type)}
              </Text>
            </View>

            <View style={localStyles.threadMain}>
              <View style={localStyles.threadTop}>
                <Text style={localStyles.threadName}>{thread.name}</Text>
                <Text style={localStyles.threadTime}>{thread.lastTime}</Text>
              </View>

              <Text style={localStyles.threadSubtitle}>{thread.subtitle}</Text>
              <Text style={localStyles.threadPreview} numberOfLines={1}>
                {thread.lastMessage}
              </Text>
            </View>

            {thread.unread > 0 && (
              <View style={localStyles.unreadBubble}>
                <Text style={localStyles.unreadText}>{thread.unread}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const localStyles = StyleSheet.create({
  threadList: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    overflow: "hidden",
  },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f6",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  threadMain: {
    flex: 1,
    minWidth: 0,
  },
  threadTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
  },
  threadName: {
    color: "#10212b",
    fontSize: 17,
    fontWeight: "900",
    flex: 1,
  },
  threadTime: {
    color: "#8b98a7",
    fontSize: 12,
    fontWeight: "700",
  },
  threadSubtitle: {
    color: "#5e7182",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  threadPreview: {
    color: "#7b8794",
    fontSize: 14,
    marginTop: 3,
  },
  unreadBubble: {
    minWidth: 23,
    height: 23,
    borderRadius: 999,
    backgroundColor: "#007aff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
});
