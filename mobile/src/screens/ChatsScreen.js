import { useMemo, useState } from "react";
import { Alert, View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet } from "react-native";
import { styles } from "../styles/styles";
import { UserAvatar } from "../components/UserAvatar";


function getThreadActivityMs(thread) {
  const rawValue =
    thread.last_time ||
    thread.lastTime ||
    thread.lastMessageAt ||
    thread.last_message_at ||
    thread.updated_at ||
    thread.created_at ||
    thread.createdAt;

  const parsed = rawValue ? Date.parse(rawValue) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ChatsScreen({
  threads,
  user,
  onOpenThread,
  onToggleMute,
  onToggleFavorite,
  onDeleteThread,
  onDeleteManagedThread,
}) {
  const [searchText, setSearchText] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  const unreadCount = threads.reduce((total, thread) => total + (thread.unread || 0), 0);

  function canDeleteGroupThread() {
    const role = String(user?.role || "").toLowerCase();
    return ["admin", "hr", "coach"].includes(role);
  }

  function handleLongPressThread(thread) {
    if (!thread) return;

    if (thread.type === "direct") {
      Alert.alert(
        "Delete conversation?",
        "This removes the direct message thread from your inbox only.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => onDeleteThread?.(thread.id),
          },
        ]
      );
      return;
    }

    if (!canDeleteGroupThread()) return;

    Alert.alert(
      "Delete group?",
      `Delete ${thread.name || "this group"} for everyone? This removes the group and its chat history.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete for Everyone",
          style: "destructive",
          onPress: () => onDeleteManagedThread?.(thread.id),
        },
      ]
    );
  }


  const sortedThreads = useMemo(() => {
    const searchValue = searchText.trim().toLowerCase();

    return [...threads]
      .filter((thread) => {
        const isFavorite = Boolean(thread.favorite);
        const threadName = String(thread.name || "").trim().toLowerCase();
        const threadType = String(thread.type || thread.thread_type || "").trim().toLowerCase();

        if (threadName === "company announcements") return false;
        if (threadType === "announcement" || threadType === "announcements") return false;

        if (activeFilter === "favorites" && !isFavorite) return false;
        if (activeFilter === "unread" && !(thread.unread > 0)) return false;
        if (activeFilter === "stores" && thread.type !== "store") return false;
        if (activeFilter === "roles" && thread.type !== "role") return false;
        if (activeFilter === "direct" && thread.type !== "direct") return false;
        if (activeFilter === "company" && thread.type !== "company") return false;

        if (!searchValue) return true;

        return (
          String(thread.name || "").toLowerCase().includes(searchValue) ||
          String(thread.lastMessage || "").toLowerCase().includes(searchValue) ||
          String(thread.type || "").toLowerCase().includes(searchValue)
        );
      })
      .sort((a, b) => {
        const aFav = Boolean(a.favorite);
        const bFav = Boolean(b.favorite);

        if (aFav !== bFav) return aFav ? -1 : 1;

        const aUnread = Number(a.unread || 0) > 0;
        const bUnread = Number(b.unread || 0) > 0;

        if (aUnread !== bUnread) return aUnread ? -1 : 1;

        const aActivity = getThreadActivityMs(a);
        const bActivity = getThreadActivityMs(b);

        if (aActivity !== bActivity) {
          return bActivity - aActivity;
        }

        const aStore = getStoreNumber(a);
        const bStore = getStoreNumber(b);

        if (a.type === "store" && b.type === "store" && aStore && bStore) {
          return Number(aStore) - Number(bStore);
        }

        const typeOrder = {
          company: 1,
          area: 2,
          role: 3,
          store: 4,
          direct: 5,
          group: 6,
        };

        const aOrder = typeOrder[a.type] || 99;
        const bOrder = typeOrder[b.type] || 99;

        if (aOrder !== bOrder) return aOrder - bOrder;

        return String(a.name || "").localeCompare(String(b.name || ""));
      });
  }, [threads, searchText, activeFilter]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={localStyles.content}>
      <View style={localStyles.heroCard}>
        <Text style={localStyles.heroEyebrow}>CHATS</Text>
        <Text style={localStyles.heroTitle}>Messages</Text>
        <Text style={localStyles.heroSubtitle}>
          {threads.length} conversations · {unreadCount} unread
        </Text>
      </View>

      <View style={localStyles.searchCard}>
        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search conversations..."
          placeholderTextColor="#7b8da0"
          autoCapitalize="none"
          style={localStyles.searchInput}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={localStyles.filterRow}
        >
          {[
            { label: "All", value: "all" },
            { label: "★ Favorites", value: "favorites" },
            { label: `Unread${unreadCount ? ` (${unreadCount})` : ""}`, value: "unread" },
            { label: "Stores", value: "stores" },
            { label: "Roles", value: "roles" },
            { label: "Direct", value: "direct" },
            { label: "Company", value: "company" },
          ].map((filter) => {
            const isActive = activeFilter === filter.value;

            return (
              <TouchableOpacity
                key={filter.value}
                style={[localStyles.filterPill, isActive && localStyles.filterPillActive]}
                onPress={() => setActiveFilter(filter.value)}
                activeOpacity={0.84}
              >
                <Text style={[localStyles.filterText, isActive && localStyles.filterTextActive]}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={localStyles.groupCard}>
        {sortedThreads.length ? (
          sortedThreads.map((thread, index) => {
            const isFavorite = Boolean(thread.favorite);
            const hasUnread = Number(thread.unread || 0) > 0;

            return (
              <View key={thread.id}>
                <View style={[localStyles.threadRow, hasUnread && localStyles.threadRowUnread]}>
                  <View style={[localStyles.unreadAccent, hasUnread && localStyles.unreadAccentActive]} />

                  <TouchableOpacity
                    style={localStyles.threadOpenArea}
                    onPress={() => onOpenThread(thread)}
                    onLongPress={() => handleLongPressThread(thread)}
                    delayLongPress={500}
                    activeOpacity={0.84}
                  >
                    <ThreadAvatar thread={thread} hasUnread={hasUnread} />

                    <View style={localStyles.threadMain}>
                      <View style={localStyles.threadTop}>
                        <Text style={[localStyles.threadName, hasUnread && localStyles.threadNameUnread]} numberOfLines={1}>
                          {thread.name}
                        </Text>

                        {thread.unread > 0 ? (
                          <View style={localStyles.unreadBadge}>
                            <Text style={localStyles.unreadText}>{thread.unread}</Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={localStyles.previewRow}>
                        <Text style={[localStyles.typePill, hasUnread && localStyles.typePillUnread]}>
                          {formatThreadType(thread.type)}
                        </Text>

                        <Text style={[localStyles.threadPreview, hasUnread && localStyles.threadPreviewUnread]} numberOfLines={1}>
                          {thread.lastMessage || "No messages yet"}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  <View style={localStyles.rightRail}>
                    <Text style={[localStyles.threadTime, hasUnread && localStyles.threadTimeUnread]}>{thread.lastTime}</Text>

                    <View style={localStyles.iconRow}>
                      <TouchableOpacity
                        style={[
                          localStyles.favoriteButton,
                          isFavorite && localStyles.favoriteButtonActive,
                        ]}
                        onPress={() => onToggleFavorite?.(thread.id, !thread.favorite)}
                        activeOpacity={0.84}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={localStyles.favoriteText}>
                          {isFavorite ? "★" : "☆"}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          localStyles.threadMuteButton,
                          thread.muted && localStyles.threadMuteButtonActive,
                        ]}
                        onPress={() => onToggleMute?.(thread.id, !thread.muted)}
                        activeOpacity={0.84}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={localStyles.threadMuteText}>
                          {thread.muted ? "🔕" : "🔔"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {index < sortedThreads.length - 1 ? (
                  <View style={[localStyles.divider, hasUnread && localStyles.dividerUnread]} />
                ) : null}
              </View>
            );
          })
        ) : (
          <View style={localStyles.emptyState}>
            <Text style={localStyles.emptyTitle}>No chats yet</Text>
            <Text style={localStyles.emptyText}>
              Try another search or filter.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function ThreadAvatar({ thread, hasUnread }) {
  if (thread.type === "direct" && thread.members?.length) {
    const otherMember =
      thread.members.find((member) => member.id !== thread.currentUserId) ||
      thread.members[0];

    return <UserAvatar user={otherMember} name={thread.name} size={34} />;
  }

  return (
    <View
      style={[
        localStyles.avatar,
        thread.type === "store" && localStyles.storeAvatar,
        hasUnread && localStyles.avatarUnread,
      ]}
    >
      <Text style={localStyles.avatarText}>{getAvatarLabel(thread)}</Text>
    </View>
  );
}

function getAvatarLabel(thread) {
  if (thread.type === "store") {
    const storeNumber = getStoreNumber(thread);
    return storeNumber ? storeNumber.slice(-2) : "ST";
  }

  const map = {
    company: "ALL",
    area: "AR",
    role: "RL",
    group: "GR",
  };

  return map[thread.type] || "CH";
}

function getStoreNumber(thread) {
  const match = String(thread.name || "").match(/\d+/);
  return match ? match[0] : "";
}

function formatThreadType(type) {
  const map = {
    company: "Company",
    area: "Area",
    store: "Store",
    role: "Role",
    direct: "DM",
    group: "Group",
  };

  return map[type] || "Chat";
}

const localStyles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 168,
  },
  heroCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  heroEyebrow: {
    color: "#ef1745",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2.3,
    marginBottom: 4,
  },
  heroTitle: {
    color: "#10212b",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.9,
  },
  heroSubtitle: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  searchCard: {
    backgroundColor: "#101d2c",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#203044",
    padding: 10,
    marginBottom: 10,
    gap: 8,
  },
  searchInput: {
    backgroundColor: "#0b1624",
    borderWidth: 1,
    borderColor: "#26384f",
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  filterRow: {
    gap: 6,
    paddingRight: 8,
  },
  filterPill: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  filterPillActive: {
    backgroundColor: "#ef1745",
  },
  filterText: {
    color: "#9aacbf",
    fontSize: 11,
    fontWeight: "900",
  },
  filterTextActive: {
    color: "#ffffff",
  },
  groupCard: {
    backgroundColor: "#101d2c",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#203044",
    overflow: "hidden",
    marginBottom: 22,
  },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    minHeight: 68,
  },
  threadRowUnread: {
    backgroundColor: "rgba(239,23,69,0.13)",
    borderLeftWidth: 0,
  },
  unreadAccent: {
    width: 4,
    height: 46,
    borderRadius: 999,
    backgroundColor: "transparent",
    marginRight: 8,
  },
  unreadAccentActive: {
    backgroundColor: "#ef1745",
  },
  threadOpenArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ef1745",
  },
  storeAvatar: {
    backgroundColor: "#e91f3f",
  },
  avatarUnread: {
    shadowColor: "#ef1745",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 12,
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
    color: "#d9e4ef",
    fontSize: 16,
    fontWeight: "850",
    flex: 1,
  },
  threadNameUnread: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  threadTime: {
    color: "#8fa1b6",
    fontSize: 10,
    fontWeight: "900",
    textAlign: "right",
  },
  threadTimeUnread: {
    color: "#ffffff",
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  typePill: {
    color: "#ffffff",
    backgroundColor: "#26364a",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  typePillUnread: {
    backgroundColor: "#ef1745",
  },
  threadPreview: {
    color: "#9aacbf",
    fontSize: 13,
    fontWeight: "800",
    flex: 1,
  },
  threadPreviewUnread: {
    color: "#ffffff",
    fontWeight: "900",
  },
  rightRail: {
    width: 58,
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 5,
    marginLeft: 6,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  favoriteButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  favoriteButtonActive: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  favoriteText: {
    color: "#ffd166",
    fontSize: 13,
    fontWeight: "900",
  },
  threadMuteButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  threadMuteButtonActive: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  threadMuteText: {
    fontSize: 10,
  },
  unreadBadge: {
    backgroundColor: "#ef1745",
    minWidth: 23,
    height: 23,
    borderRadius: 12,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ef1745",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  unreadText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },
  divider: {
    height: 1,
    backgroundColor: "#203044",
    marginLeft: 66,
  },
  dividerUnread: {
    backgroundColor: "rgba(239,23,69,0.28)",
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
